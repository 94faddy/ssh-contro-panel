import dotenv from 'dotenv';
dotenv.config();

console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);
console.log('WS_PORT:', process.env.WS_PORT || '3005');

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { 
  getSSHConnection, 
  executeCommand, 
  createShellSession, 
  executeShellCommand,
  executeShellCommandStreaming,
  executeCommandStreaming,
  closeShellSession, 
  getShellSessionInfo 
} from './ssh';
import { getUserFromToken, createSession, getSession, updateSessionActivity, removeSession } from './auth';
import { prisma } from './database';
import { preprocessCommand } from './command-middleware';
import type { TerminalWSMessage, ScriptWSMessage } from '@/types';

// ใช้ WS_PORT จาก environment variable (default: 3005)
const PORT = parseInt(process.env.WS_PORT || '3005', 10);

// Create HTTP server
const httpServer = createServer();

// CORS origins - รองรับทั้ง development และ production
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];
  
  // Development origins
  origins.push('http://localhost:3000');
  origins.push('http://127.0.0.1:3000');
  
  // Production origins from env
  if (process.env.NEXTAUTH_URL) {
    origins.push(process.env.NEXTAUTH_URL);
  }
  
  if (process.env.DOMAIN) {
    origins.push(process.env.DOMAIN);
  }
  
  return origins;
};

// Create Socket.IO server with better CORS support
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      if (origin.includes('pix9.my')) {
        return callback(null, true);
      }
      
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

// Active terminal sessions
const terminalSessions = new Map<string, {
  userId: number;
  serverId: number;
  shellSessionId: string;
  isActive: boolean;
  lastActivity: Date;
}>();

// Active script executions
const scriptExecutions = new Map<string, {
  userId: number;
  serverIds: number[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  results: Map<number, any>;
  abortControllers: Map<number, boolean>; // Track if server execution should be aborted
}>();

// Authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('No authentication token provided'));
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return next(new Error('Invalid authentication token'));
    }

    socket.data.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// Connection handler
io.on('connection', (socket) => {
  console.log(`User ${socket.data.user.email} connected from ${socket.handshake.address}`);

  // Handle terminal connection
  socket.on('terminal:connect', async (data: { serverId: number }) => {
    try {
      const { serverId } = data;
      const userId = socket.data.user.id;

      const server = await prisma.server.findUnique({
        where: { id: serverId }
      });

      if (!server || (server.userId !== userId && socket.data.user.role !== 'ADMIN')) {
        socket.emit('terminal:error', { error: 'Access denied to this server' });
        return;
      }

      const sessionId = `${userId}-${serverId}-${Date.now()}`;
      const shellSessionId = `shell-${sessionId}`;

      const shellCreated = await createShellSession(serverId, userId, shellSessionId);
      
      if (!shellCreated) {
        socket.emit('terminal:error', { error: 'Failed to create shell session' });
        return;
      }

      try {
        await executeShellCommand(shellSessionId, 'export TERM=xterm-256color; export COLORTERM=truecolor');
      } catch (error) {
        console.log('Failed to set terminal environment, continuing anyway');
      }

      terminalSessions.set(sessionId, {
        userId,
        serverId,
        shellSessionId,
        isActive: true,
        lastActivity: new Date()
      });

      socket.join(`terminal-${sessionId}`);
      socket.data.terminalSession = sessionId;

      const sessionInfo = getShellSessionInfo(shellSessionId);
      const currentDir = sessionInfo?.cwd || '/';

      socket.emit('terminal:connected', { 
        sessionId, 
        serverName: server.name,
        serverId,
        currentDir
      });

      console.log(`Terminal session ${sessionId} started for server ${server.name}`);
    } catch (error) {
      console.error('Terminal connection error:', error);
      socket.emit('terminal:error', { error: 'Failed to connect to terminal' });
    }
  });

  // Handle terminal command with STREAMING output
  socket.on('terminal:command', async (data: { sessionId: string; command: string }) => {
    try {
      const { sessionId, command } = data;
      const session = terminalSessions.get(sessionId);

      if (!session || !session.isActive) {
        socket.emit('terminal:error', { error: 'Invalid terminal session' });
        return;
      }

      session.lastActivity = new Date();

      if (!command.trim()) {
        const sessionInfo = getShellSessionInfo(session.shellSessionId);
        socket.emit('terminal:output', {
          sessionId,
          command: '',
          stdout: '',
          stderr: '',
          exitCode: 0,
          currentDir: sessionInfo?.cwd || '/',
          timestamp: new Date().toISOString(),
          isComplete: true
        });
        return;
      }

      const processedCommand = preprocessCommand(command);
      
      // Notify client that command started
      socket.emit('terminal:command-started', {
        sessionId,
        command: processedCommand,
        timestamp: new Date().toISOString()
      });

      // Use streaming execution
      try {
        const result = await executeShellCommandStreaming(
          session.shellSessionId, 
          processedCommand,
          (type, data) => {
            // Stream data to client in real-time
            if (type === 'stdout') {
              socket.emit('terminal:stream', {
                sessionId,
                type: 'stdout',
                data: data as string,
                timestamp: new Date().toISOString()
              });
            } else if (type === 'stderr') {
              socket.emit('terminal:stream', {
                sessionId,
                type: 'stderr',
                data: data as string,
                timestamp: new Date().toISOString()
              });
            } else if (type === 'exit') {
              // Command completed - send final message
              const sessionInfo = getShellSessionInfo(session.shellSessionId);
              socket.emit('terminal:output', {
                sessionId,
                command: processedCommand,
                stdout: '',
                stderr: '',
                exitCode: data as number,
                currentDir: sessionInfo?.cwd || '/',
                timestamp: new Date().toISOString(),
                isComplete: true
              });
            }
          },
          { timeout: 300000 }
        );

        console.log(`Command executed in session ${sessionId}: ${processedCommand.substring(0, 50)}${processedCommand.length > 50 ? '...' : ''}`);
      } catch (error) {
        console.error('Terminal command error:', error);
        socket.emit('terminal:error', { 
          error: 'Failed to execute command',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Send completion anyway so UI doesn't hang
        const sessionInfo = getShellSessionInfo(session.shellSessionId);
        socket.emit('terminal:output', {
          sessionId,
          command: processedCommand,
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Unknown error',
          exitCode: 1,
          currentDir: sessionInfo?.cwd || '/',
          timestamp: new Date().toISOString(),
          isComplete: true
        });
      }
    } catch (error) {
      console.error('Terminal command error:', error);
      socket.emit('terminal:error', { 
        error: 'Failed to execute command',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Handle terminal tab completion
  socket.on('terminal:tab-complete', async (data: { sessionId: string; partial: string; currentDir: string }) => {
    try {
      const { sessionId, partial, currentDir } = data;
      const session = terminalSessions.get(sessionId);

      if (!session || !session.isActive) {
        socket.emit('terminal:tab-complete-result', { sessionId, completions: [] });
        return;
      }

      const completionCommand = `cd "${currentDir}" && compgen -c "${partial}" 2>/dev/null | head -20`;
      
      try {
        const result = await executeShellCommand(session.shellSessionId, completionCommand);
        
        const completions = result.stdout
          .split('\n')
          .filter(line => line.trim() && line.startsWith(partial))
          .slice(0, 15);

        if (completions.length === 0) {
          const fileCompletionCommand = `cd "${currentDir}" && compgen -f "${partial}" 2>/dev/null | head -15`;
          const fileResult = await executeShellCommand(session.shellSessionId, fileCompletionCommand);
          
          const fileCompletions = fileResult.stdout
            .split('\n')
            .filter(line => line.trim() && line.startsWith(partial))
            .slice(0, 15);
            
          socket.emit('terminal:tab-complete-result', {
            sessionId,
            partial,
            completions: fileCompletions
          });
        } else {
          socket.emit('terminal:tab-complete-result', {
            sessionId,
            partial,
            completions
          });
        }
      } catch (error) {
        const basicCommand = `cd "${currentDir}" && ls -1 | grep "^${partial}" 2>/dev/null | head -10`;
        try {
          const basicResult = await executeShellCommand(session.shellSessionId, basicCommand);
          const basicCompletions = basicResult.stdout
            .split('\n')
            .filter(line => line.trim())
            .slice(0, 10);
            
          socket.emit('terminal:tab-complete-result', {
            sessionId,
            partial,
            completions: basicCompletions
          });
        } catch {
          socket.emit('terminal:tab-complete-result', { sessionId, completions: [] });
        }
      }
    } catch (error) {
      console.error('Tab completion error:', error);
      socket.emit('terminal:tab-complete-result', { sessionId: data.sessionId, completions: [] });
    }
  });

  // Handle terminal disconnect
  socket.on('terminal:disconnect', (data: { sessionId: string }) => {
    try {
      const { sessionId } = data;
      const session = terminalSessions.get(sessionId);

      if (session) {
        session.isActive = false;
        closeShellSession(session.shellSessionId);
        terminalSessions.delete(sessionId);
      }

      socket.leave(`terminal-${sessionId}`);
      
      console.log(`Terminal session ${sessionId} ended`);
    } catch (error) {
      console.error('Terminal disconnect error:', error);
    }
  });

  // Handle script execution with STREAMING output
  socket.on('script:run', async (data: { 
    scriptName: string; 
    command: string; 
    serverIds: number[] 
  }) => {
    try {
      const { scriptName, command, serverIds } = data;
      const userId = socket.data.user.id;
      const executionId = `${userId}-${Date.now()}`;

      // Validate servers access
      const servers = await prisma.server.findMany({
        where: {
          id: { in: serverIds },
          ...(socket.data.user.role !== 'ADMIN' ? { userId } : {})
        }
      });

      if (servers.length !== serverIds.length) {
        socket.emit('script:error', { error: 'Access denied to some servers' });
        return;
      }

      // Create script execution record
      scriptExecutions.set(executionId, {
        userId,
        serverIds,
        status: 'running',
        results: new Map(),
        abortControllers: new Map()
      });

      // Initialize abort controllers for each server
      servers.forEach(server => {
        scriptExecutions.get(executionId)?.abortControllers.set(server.id, false);
      });

      // Join script room
      socket.join(`script-${executionId}`);

      // Create script logs for each server
      const scriptLogs = await Promise.all(
        servers.map(server => 
          prisma.scriptLog.create({
            data: {
              scriptName,
              command,
              status: 'RUNNING',
              userId,
              serverId: server.id,
              startTime: new Date()
            }
          })
        )
      );

      socket.emit('script:started', { 
        executionId, 
        serverCount: servers.length,
        servers: servers.map(s => ({ id: s.id, name: s.name }))
      });

      // Execute script on all servers with streaming
      const executions = servers.map(async (server, index) => {
        const execution = scriptExecutions.get(executionId);
        
        try {
          // Emit initial status
          socket.emit('script:progress', {
            executionId,
            serverId: server.id,
            serverName: server.name,
            status: 'running',
            message: 'Starting execution...',
            output: '',
            error: ''
          });

          let stdoutBuffer = '';
          let stderrBuffer = '';

          // Use streaming execution
          const result = await executeCommandStreaming(
            server.id, 
            userId, 
            command,
            (type, data) => {
              // Check if cancelled
              if (execution?.abortControllers.get(server.id)) {
                return;
              }

              if (type === 'stdout') {
                stdoutBuffer += data as string;
                // Stream output to client in real-time
                socket.emit('script:stream', {
                  executionId,
                  serverId: server.id,
                  serverName: server.name,
                  type: 'stdout',
                  data: data as string,
                  timestamp: new Date().toISOString()
                });
              } else if (type === 'stderr') {
                stderrBuffer += data as string;
                socket.emit('script:stream', {
                  executionId,
                  serverId: server.id,
                  serverName: server.name,
                  type: 'stderr',
                  data: data as string,
                  timestamp: new Date().toISOString()
                });
              } else if (type === 'exit') {
                const exitCode = data as number;
                const status = exitCode === 0 ? 'success' : 'failed';
                
                // Send final progress update
                socket.emit('script:progress', {
                  executionId,
                  serverId: server.id,
                  serverName: server.name,
                  status,
                  output: stdoutBuffer,
                  error: stderrBuffer,
                  exitCode,
                  isComplete: true
                });
              }
            },
            { timeout: 300000 }
          );

          // Update script log
          await prisma.scriptLog.update({
            where: { id: scriptLogs[index].id },
            data: {
              status: result.exitCode === 0 ? 'SUCCESS' : 'FAILED',
              output: stdoutBuffer.substring(0, 50000), // Limit size
              error: stderrBuffer.substring(0, 50000),
              endTime: new Date(),
              duration: Math.floor((Date.now() - scriptLogs[index].startTime.getTime()) / 1000)
            }
          });

          return { 
            serverId: server.id, 
            success: result.exitCode === 0, 
            exitCode: result.exitCode,
            stdout: stdoutBuffer,
            stderr: stderrBuffer
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // Update script log with error
          await prisma.scriptLog.update({
            where: { id: scriptLogs[index].id },
            data: {
              status: 'FAILED',
              error: errorMessage,
              endTime: new Date(),
              duration: Math.floor((Date.now() - scriptLogs[index].startTime.getTime()) / 1000)
            }
          });

          socket.emit('script:progress', {
            executionId,
            serverId: server.id,
            serverName: server.name,
            status: 'failed',
            error: errorMessage,
            isComplete: true
          });

          return { 
            serverId: server.id, 
            success: false, 
            exitCode: 1,
            error: errorMessage 
          };
        }
      });

      // Wait for all executions to complete
      const results = await Promise.all(executions);
      
      // Update execution status
      const execution = scriptExecutions.get(executionId);
      if (execution) {
        execution.status = 'completed';
        results.forEach(result => {
          execution.results.set(result.serverId, result);
        });
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;

      socket.emit('script:completed', {
        executionId,
        totalServers: results.length,
        successCount,
        failedCount,
        results: results.map(r => ({
          serverId: r.serverId,
          success: r.success,
          exitCode: r.exitCode,
          output: r.stdout || '',
          error: r.stderr || r.error || ''
        }))
      });

      console.log(`Script execution ${executionId} completed: ${successCount}/${results.length} successful`);

    } catch (error) {
      console.error('Script execution error:', error);
      socket.emit('script:error', { 
        error: 'Failed to execute script',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Handle script cancellation
  socket.on('script:cancel', async (data: { executionId: string }) => {
    try {
      const { executionId } = data;
      const execution = scriptExecutions.get(executionId);

      if (execution && execution.status === 'running') {
        // Mark all servers as cancelled
        execution.abortControllers.forEach((_, serverId) => {
          execution.abortControllers.set(serverId, true);
        });
        
        execution.status = 'cancelled';
        
        // Update any running script logs to cancelled
        await prisma.scriptLog.updateMany({
          where: {
            userId: execution.userId,
            status: 'RUNNING',
            startTime: {
              gte: new Date(Date.now() - 600000)
            }
          },
          data: {
            status: 'CANCELLED',
            endTime: new Date()
          }
        });

        socket.emit('script:cancelled', { executionId });
        console.log(`Script execution ${executionId} cancelled`);
      }
    } catch (error) {
      console.error('Script cancellation error:', error);
    }
  });

  // Handle server status check
  socket.on('server:status', async (data: { serverId: number }) => {
    try {
      const { serverId } = data;
      const userId = socket.data.user.id;

      const server = await prisma.server.findUnique({
        where: { id: serverId }
      });

      if (!server || (server.userId !== userId && socket.data.user.role !== 'ADMIN')) {
        socket.emit('server:error', { error: 'Access denied to this server' });
        return;
      }

      const ssh = await getSSHConnection(serverId, userId);
      
      if (ssh) {
        try {
          const systemInfo = await import('./ssh').then(m => m.getSystemInfo(ssh));
          
          socket.emit('server:status', {
            serverId,
            status: 'CONNECTED',
            systemInfo,
            lastChecked: new Date().toISOString()
          });
        } catch (error) {
          socket.emit('server:status', {
            serverId,
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            lastChecked: new Date().toISOString()
          });
        }
      } else {
        socket.emit('server:status', {
          serverId,
          status: 'DISCONNECTED',
          lastChecked: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Server status check error:', error);
      socket.emit('server:error', { 
        error: 'Failed to check server status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Handle server restart
  socket.on('server:restart', async (data: { serverId: number }) => {
    try {
      const { serverId } = data;
      const userId = socket.data.user.id;

      const server = await prisma.server.findUnique({
        where: { id: serverId }
      });

      if (!server || (server.userId !== userId && socket.data.user.role !== 'ADMIN')) {
        socket.emit('server:error', { error: 'Access denied to this server' });
        return;
      }

      socket.emit('server:restarting', { serverId, serverName: server.name });

      const result = await executeCommand(serverId, userId, 'sudo reboot', { timeout: 10000 });

      socket.emit('server:restart-initiated', {
        serverId,
        serverName: server.name,
        output: result.stdout,
        error: result.stderr
      });

      console.log(`Server restart initiated for ${server.name}`);
    } catch (error) {
      console.error('Server restart error:', error);
      socket.emit('server:error', { 
        error: 'Failed to restart server',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Handle real-time logs
  socket.on('logs:subscribe', async (data: { serverId: number; logType?: string }) => {
    try {
      const { serverId, logType } = data;
      const userId = socket.data.user.id;

      const server = await prisma.server.findUnique({
        where: { id: serverId }
      });

      if (!server || (server.userId !== userId && socket.data.user.role !== 'ADMIN')) {
        socket.emit('logs:error', { error: 'Access denied to this server' });
        return;
      }

      socket.join(`logs-${serverId}`);

      const recentLogs = await prisma.serverLog.findMany({
        where: {
          serverId,
          ...(logType ? { logType: logType as any } : {})
        },
        orderBy: { timestamp: 'desc' },
        take: 50
      });

      socket.emit('logs:initial', {
        serverId,
        logs: recentLogs.reverse()
      });

      console.log(`User subscribed to logs for server ${server.name}`);
    } catch (error) {
      console.error('Logs subscription error:', error);
      socket.emit('logs:error', { 
        error: 'Failed to subscribe to logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  socket.on('logs:unsubscribe', (data: { serverId: number }) => {
    const { serverId } = data;
    socket.leave(`logs-${serverId}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User ${socket.data.user.email} disconnected`);

    if (socket.data.terminalSession) {
      const session = terminalSessions.get(socket.data.terminalSession);
      if (session) {
        session.isActive = false;
        closeShellSession(session.shellSessionId);
        terminalSessions.delete(socket.data.terminalSession);
      }
    }

    socket.rooms.forEach(room => {
      socket.leave(room);
    });
  });
});

// Broadcast new logs to subscribers
export function broadcastLog(serverId: number, log: any) {
  io.to(`logs-${serverId}`).emit('logs:new', { serverId, log });
}

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  for (const [sessionId, session] of terminalSessions.entries()) {
    if (session.lastActivity < fiveMinutesAgo) {
      session.isActive = false;
      closeShellSession(session.shellSessionId);
      terminalSessions.delete(sessionId);
      console.log(`Cleaned up inactive terminal session: ${sessionId}`);
    }
  }

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  for (const [executionId, execution] of scriptExecutions.entries()) {
    const executionTime = new Date(parseInt(executionId.split('-')[1]));
    if (executionTime < oneHourAgo) {
      scriptExecutions.delete(executionId);
      console.log(`Cleaned up old script execution: ${executionId}`);
    }
  }
}, 5 * 60 * 1000);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(`📡 CORS allowed origins:`, getAllowedOrigins());
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('WebSocket server shutting down...');
  
  io.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('WebSocket server shutting down...');
  
  io.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

export { io };
export default io;