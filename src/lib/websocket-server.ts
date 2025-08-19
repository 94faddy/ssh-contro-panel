import dotenv from 'dotenv';
dotenv.config();

console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { 
  getSSHConnection, 
  executeCommand, 
  createShellSession, 
  executeShellCommand, 
  closeShellSession, 
  getShellSessionInfo 
} from './ssh';
import { getUserFromToken, createSession, getSession, updateSessionActivity, removeSession } from './auth';
import { prisma } from './database';
import { preprocessCommand } from './command-middleware';
import type { TerminalWSMessage, ScriptWSMessage } from '@/types';

const PORT = process.env.WS_PORT || 3001;

// Create HTTP server
const httpServer = createServer();

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
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
  status: 'running' | 'completed' | 'failed';
  results: Map<number, any>;
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
    next(new Error('Authentication failed'));
  }
});

// Connection handler
io.on('connection', (socket) => {
  console.log(`User ${socket.data.user.email} connected`);

  // Handle terminal connection
  socket.on('terminal:connect', async (data: { serverId: number }) => {
    try {
      const { serverId } = data;
      const userId = socket.data.user.id;

      // Check if user can access this server
      const server = await prisma.server.findUnique({
        where: { id: serverId }
      });

      if (!server || (server.userId !== userId && socket.data.user.role !== 'ADMIN')) {
        socket.emit('terminal:error', { error: 'Access denied to this server' });
        return;
      }

      // Create shell session
      const sessionId = `${userId}-${serverId}-${Date.now()}`;
      const shellSessionId = `shell-${sessionId}`;

      // Create shell session with proper environment
      const shellCreated = await createShellSession(serverId, userId, shellSessionId);
      
      if (!shellCreated) {
        socket.emit('terminal:error', { error: 'Failed to create shell session' });
        return;
      }

      // Initialize terminal environment
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

      // Join terminal room
      socket.join(`terminal-${sessionId}`);
      socket.data.terminalSession = sessionId;

      // Get initial session info
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

  // Handle terminal command
  socket.on('terminal:command', async (data: { sessionId: string; command: string }) => {
    try {
      const { sessionId, command } = data;
      const session = terminalSessions.get(sessionId);

      if (!session || !session.isActive) {
        socket.emit('terminal:error', { error: 'Invalid terminal session' });
        return;
      }

      // Update session activity
      session.lastActivity = new Date();

      // Handle empty command
      if (!command.trim()) {
        const sessionInfo = getShellSessionInfo(session.shellSessionId);
        socket.emit('terminal:output', {
          sessionId,
          command: '',
          stdout: '',
          stderr: '',
          exitCode: 0,
          currentDir: sessionInfo?.cwd || '/',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Preprocess command (handle aliases, add safety flags)
      const processedCommand = preprocessCommand(command);
      
      // Execute command in shell session
      const result = await executeShellCommand(session.shellSessionId, processedCommand, {
        timeout: 300000 // 5 minutes
      });

      // Send result back to client
      socket.emit('terminal:output', {
        sessionId,
        command: processedCommand,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        currentDir: result.cwd || '/',
        timestamp: new Date().toISOString()
      });

      console.log(`Command executed in session ${sessionId}: ${processedCommand.substring(0, 50)}${processedCommand.length > 50 ? '...' : ''}`);
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

      // Use server's actual tab completion instead of predefined list
      const completionCommand = `cd "${currentDir}" && compgen -c "${partial}" 2>/dev/null | head -20`;
      
      try {
        const result = await executeShellCommand(session.shellSessionId, completionCommand);
        
        const completions = result.stdout
          .split('\n')
          .filter(line => line.trim() && line.startsWith(partial))
          .slice(0, 15); // Limit to 15 completions

        // If no command completions, try file completions
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
        // Fallback to basic file completion if compgen fails
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

  // Handle script execution
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
        results: new Map()
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

      // Execute script on all servers
      const executions = servers.map(async (server, index) => {
        try {
          socket.emit('script:progress', {
            executionId,
            serverId: server.id,
            serverName: server.name,
            status: 'running',
            message: 'Executing command...'
          });

          const result = await executeCommand(server.id, userId, command, { timeout: 300000 }); // 5 minutes timeout

          // Update script log
          await prisma.scriptLog.update({
            where: { id: scriptLogs[index].id },
            data: {
              status: result.code === 0 ? 'SUCCESS' : 'FAILED',
              output: result.stdout,
              error: result.stderr,
              endTime: new Date(),
              duration: Math.floor((Date.now() - scriptLogs[index].startTime.getTime()) / 1000)
            }
          });

          socket.emit('script:progress', {
            executionId,
            serverId: server.id,
            serverName: server.name,
            status: result.code === 0 ? 'success' : 'failed',
            output: result.stdout,
            error: result.stderr,
            exitCode: result.code
          });

          return { serverId: server.id, success: result.code === 0, result };
        } catch (error) {
          // Update script log with error
          await prisma.scriptLog.update({
            where: { id: scriptLogs[index].id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : 'Unknown error',
              endTime: new Date(),
              duration: Math.floor((Date.now() - scriptLogs[index].startTime.getTime()) / 1000)
            }
          });

          socket.emit('script:progress', {
            executionId,
            serverId: server.id,
            serverName: server.name,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          return { serverId: server.id, success: false, error };
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
          output: r.result?.stdout || '',
          error: r.result?.stderr || r.error || ''
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
        execution.status = 'completed';
        
        // Update any running script logs to cancelled
        await prisma.scriptLog.updateMany({
          where: {
            userId: execution.userId,
            status: 'RUNNING',
            startTime: {
              gte: new Date(Date.now() - 600000) // Last 10 minutes
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

      // Try to get SSH connection to check status
      const ssh = await getSSHConnection(serverId, userId);
      
      if (ssh) {
        try {
          // Get current system info
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

      // Execute restart command
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

      // Join logs room
      socket.join(`logs-${serverId}`);

      // Send recent logs
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

    // Clean up terminal sessions
    if (socket.data.terminalSession) {
      const session = terminalSessions.get(socket.data.terminalSession);
      if (session) {
        session.isActive = false;
        closeShellSession(session.shellSessionId);
        terminalSessions.delete(socket.data.terminalSession);
      }
    }

    // Leave all rooms
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

  // Cleanup script executions older than 1 hour
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
  console.log(`WebSocket server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('WebSocket server shutting down...');
  
  // Close all socket connections
  io.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('WebSocket server shutting down...');
  
  // Close all socket connections
  io.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

export { io };
export default io;