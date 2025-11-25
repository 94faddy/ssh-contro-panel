import dotenv from 'dotenv';
dotenv.config();

console.log('JWT_SECRET loaded:', !!process.env.JWT_SECRET);
console.log('WS_PORT:', process.env.WS_PORT || '3005');

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Import PrismaClient directly (websocket-server runs standalone, not through Next.js)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Import non-PTY functions from ssh.ts
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

// Import PTY functions from ssh-pty.ts
import {
  createPTYShellSession,
  setPTYSessionHandlers,
  writeToPTYSession,
  resizePTYSession,
  closePTYShellSession,
  getPTYSessionInfo
} from './ssh-pty';

import { getUserFromToken } from './auth';
import { preprocessCommand } from './command-middleware';

const PORT = parseInt(process.env.WS_PORT || '3005', 10);
const httpServer = createServer();

const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];
  
  origins.push('http://localhost:3000');
  origins.push('http://127.0.0.1:3000');
  
  if (process.env.NEXTAUTH_URL) {
    origins.push(process.env.NEXTAUTH_URL);
  }
  
  if (process.env.DOMAIN) {
    origins.push(process.env.DOMAIN);
  }
  
  return origins;
};

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
  maxHttpBufferSize: 1e8,
  connectTimeout: 45000
});

console.log('📡 CORS allowed origins:', getAllowedOrigins());

// ==========================================
// Terminal Session Management
// ==========================================
interface TerminalSession {
  userId: number;
  serverId: number;
  sessionType: 'pty' | 'legacy';
  shellSessionId: string;
  isActive: boolean;
  lastActivity: Date;
}

const terminalSessions = new Map<string, TerminalSession>();

// ==========================================
// Script Execution Management  
// ==========================================
interface ScriptExecution {
  userId: number;
  scriptId: number;
  servers: number[];
  currentServer: number;
  isRunning: boolean;
  abortController: AbortController | null;
  startTime: Date;
}

const scriptExecutions = new Map<string, ScriptExecution>();

// ==========================================
// Authentication Middleware
// ==========================================
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const user = await getUserFromToken(token as string);
    if (!user) {
      return next(new Error('Invalid token'));
    }

    socket.data.userId = user.id;
    socket.data.email = user.email;
    next();
  } catch (error) {
    console.error('WebSocket auth error:', error);
    next(new Error('Authentication failed'));
  }
});

// ==========================================
// Connection Handler
// ==========================================
io.on('connection', (socket) => {
  const userId = socket.data.userId;
  const userEmail = socket.data.email;
  
  console.log(`User ${userEmail} connected from ${socket.handshake.address}`);

  // ==========================================
  // Terminal Connect (PTY Mode)
  // ==========================================
  socket.on('terminal:connect', async (data: { serverId: number; cols?: number; rows?: number }) => {
    try {
      const { serverId, cols = 120, rows = 30 } = data;

      // Verify server access
      const server = await prisma.server.findUnique({
        where: { id: serverId },
      });

      if (!server || server.userId !== userId) {
        socket.emit('terminal:error', { error: 'Access denied to this server' });
        return;
      }

      const sessionId = `pty-${userId}-${serverId}-${Date.now()}`;

      // Create PTY shell session
      const result = await createPTYShellSession(serverId, userId, sessionId, { cols, rows });
      
      if (!result.success) {
        socket.emit('terminal:error', { error: result.error || 'Failed to create PTY session' });
        return;
      }

      // Set up data handlers for PTY
      const handlerSet = setPTYSessionHandlers(
        sessionId,
        // onData - send PTY output to client
        (data: string) => {
          socket.emit('terminal:data', {
            sessionId,
            data
          });
        },
        // onClose
        () => {
          socket.emit('terminal:closed', { sessionId });
          terminalSessions.delete(sessionId);
        }
      );

      if (!handlerSet) {
        socket.emit('terminal:error', { error: 'Failed to set up PTY handlers' });
        return;
      }

      // Store session info
      terminalSessions.set(sessionId, {
        userId,
        serverId,
        sessionType: 'pty',
        shellSessionId: sessionId,
        isActive: true,
        lastActivity: new Date()
      });

      socket.join(`terminal-${sessionId}`);
      socket.data.terminalSession = sessionId;

      socket.emit('terminal:connected', { 
        sessionId, 
        serverName: server.name,
        serverId,
        currentDir: result.cwd || '~'
      });

      console.log(`PTY Terminal session ${sessionId} started for server ${server.name}`);
    } catch (error) {
      console.error('Terminal connection error:', error);
      socket.emit('terminal:error', { error: 'Failed to connect to terminal' });
    }
  });

  // ==========================================
  // Terminal Input (User typing)
  // ==========================================
  socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
    try {
      const { sessionId, data: inputData } = data;
      const session = terminalSessions.get(sessionId);

      if (!session || !session.isActive) {
        socket.emit('terminal:error', { error: 'Invalid terminal session' });
        return;
      }

      session.lastActivity = new Date();

      // Write to PTY
      const success = writeToPTYSession(sessionId, inputData);
      
      if (!success) {
        socket.emit('terminal:error', { error: 'Failed to write to terminal' });
      }
    } catch (error) {
      console.error('Terminal input error:', error);
      socket.emit('terminal:error', { error: 'Failed to send input' });
    }
  });

  // ==========================================
  // Terminal Resize
  // ==========================================
  socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
    try {
      const { sessionId, cols, rows } = data;
      const session = terminalSessions.get(sessionId);

      if (!session || !session.isActive) {
        return;
      }

      resizePTYSession(sessionId, cols, rows);
    } catch (error) {
      console.error('Terminal resize error:', error);
    }
  });

  // ==========================================
  // Terminal Disconnect
  // ==========================================
  socket.on('terminal:disconnect', (data: { sessionId: string }) => {
    try {
      const { sessionId } = data;
      const session = terminalSessions.get(sessionId);

      if (session) {
        session.isActive = false;
        
        if (session.sessionType === 'pty') {
          closePTYShellSession(sessionId);
        } else {
          closeShellSession(session.shellSessionId);
        }
        
        terminalSessions.delete(sessionId);
      }

      socket.leave(`terminal-${sessionId}`);
      
      console.log(`Terminal session ${sessionId} ended`);
    } catch (error) {
      console.error('Terminal disconnect error:', error);
    }
  });

  // ==========================================
  // Legacy Terminal Command (for backward compatibility)
  // ==========================================
  socket.on('terminal:command', async (data: { sessionId: string; command: string }) => {
    try {
      const { sessionId, command } = data;
      const session = terminalSessions.get(sessionId);

      if (!session || !session.isActive) {
        socket.emit('terminal:error', { error: 'Invalid terminal session' });
        return;
      }

      session.lastActivity = new Date();

      // For PTY sessions, just write the command + enter
      if (session.sessionType === 'pty') {
        writeToPTYSession(sessionId, command + '\r');
        return;
      }

      // Legacy mode - execute command via exec
      if (!command.trim()) {
        const sessionInfo = getShellSessionInfo(session.shellSessionId);
        socket.emit('terminal:output', {
          sessionId,
          output: '',
          exitCode: 0,
          cwd: sessionInfo?.cwd || '/'
        });
        return;
      }

      const processedCommand = preprocessCommand(command);

      await executeShellCommandStreaming(
        session.shellSessionId,
        processedCommand,
        (type, data) => {
          if (type === 'stdout' || type === 'stderr') {
            socket.emit('terminal:stream', {
              sessionId,
              data: data as string,
              type
            });
          } else if (type === 'exit') {
            const sessionInfo = getShellSessionInfo(session.shellSessionId);
            socket.emit('terminal:output', {
              sessionId,
              output: '',
              exitCode: data as number,
              cwd: sessionInfo?.cwd || '/'
            });
          }
        },
        { timeout: 300000 }
      );
    } catch (error) {
      console.error('Terminal command error:', error);
      socket.emit('terminal:error', { 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  });

  // ==========================================
  // Script Execution
  // ==========================================
  socket.on('script:run', async (data: { 
    scriptId: number; 
    serverIds: number[]; 
    executionId?: string 
  }) => {
    try {
      const { scriptId, serverIds, executionId } = data;
      const execId = executionId || `exec-${userId}-${scriptId}-${Date.now()}`;

      console.log(`Script execution requested: scriptId=${scriptId}, servers=${serverIds.join(',')}`);

      // Get script
      const script = await prisma.script.findUnique({
        where: { id: scriptId },
      });

      if (!script || script.userId !== userId) {
        socket.emit('script:error', { executionId: execId, error: 'Script not found' });
        return;
      }

      // Get servers
      const servers = await prisma.server.findMany({
        where: { 
          id: { in: serverIds },
          userId 
        },
      });

      if (servers.length === 0) {
        socket.emit('script:error', { executionId: execId, error: 'No valid servers' });
        return;
      }

      // Create execution record
      scriptExecutions.set(execId, {
        userId,
        scriptId,
        servers: serverIds,
        currentServer: 0,
        isRunning: true,
        abortController: new AbortController(),
        startTime: new Date()
      });

      socket.emit('script:started', { 
        executionId: execId,
        scriptName: script.name,
        servers: servers.map(s => ({ id: s.id, name: s.name }))
      });

      // Execute on each server
      for (const server of servers) {
        const execution = scriptExecutions.get(execId);
        if (!execution || !execution.isRunning) {
          break;
        }

        socket.emit('script:server:start', {
          executionId: execId,
          serverId: server.id,
          serverName: server.name
        });

        try {
          const result = await executeCommandStreaming(
            server.id,
            userId,
            script.content,
            (type, data) => {
              if (type === 'stdout' || type === 'stderr') {
                socket.emit('script:stream', {
                  executionId: execId,
                  serverId: server.id,
                  data: data as string,
                  type
                });
              }
            },
            { timeout: 600000 } // 10 minutes
          );

          socket.emit('script:server:complete', {
            executionId: execId,
            serverId: server.id,
            serverName: server.name,
            exitCode: result.exitCode,
            success: result.exitCode === 0
          });
        } catch (error) {
          socket.emit('script:server:error', {
            executionId: execId,
            serverId: server.id,
            serverName: server.name,
            error: error instanceof Error ? error.message : 'Execution failed'
          });
        }
      }

      scriptExecutions.delete(execId);
      
      socket.emit('script:complete', { 
        executionId: execId,
        scriptName: script.name
      });
    } catch (error) {
      console.error('Script execution error:', error);
      socket.emit('script:error', { 
        error: error instanceof Error ? error.message : 'Script execution failed' 
      });
    }
  });

  // ==========================================
  // Script Cancel
  // ==========================================
  socket.on('script:cancel', (data: { executionId: string }) => {
    try {
      const { executionId } = data;
      const execution = scriptExecutions.get(executionId);

      if (execution && execution.userId === userId) {
        execution.isRunning = false;
        if (execution.abortController) {
          execution.abortController.abort();
        }
        scriptExecutions.delete(executionId);
        
        socket.emit('script:cancelled', { executionId });
      }
    } catch (error) {
      console.error('Script cancel error:', error);
    }
  });

  // ==========================================
  // Disconnect Handler
  // ==========================================
  socket.on('disconnect', (reason) => {
    console.log(`User ${userEmail} disconnected: ${reason}`);

    // Cleanup terminal sessions
    for (const [sessionId, session] of terminalSessions.entries()) {
      if (session.userId === userId) {
        if (session.sessionType === 'pty') {
          closePTYShellSession(sessionId);
        } else {
          closeShellSession(session.shellSessionId);
        }
        terminalSessions.delete(sessionId);
      }
    }

    // Cleanup script executions
    for (const [execId, execution] of scriptExecutions.entries()) {
      if (execution.userId === userId) {
        execution.isRunning = false;
        if (execution.abortController) {
          execution.abortController.abort();
        }
        scriptExecutions.delete(execId);
      }
    }
  });
});

// ==========================================
// Cleanup Inactive Sessions
// ==========================================
setInterval(() => {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [sessionId, session] of terminalSessions.entries()) {
    if (now.getTime() - session.lastActivity.getTime() > timeout) {
      console.log(`Cleaning up inactive terminal session: ${sessionId}`);
      
      if (session.sessionType === 'pty') {
        closePTYShellSession(sessionId);
      } else {
        closeShellSession(session.shellSessionId);
      }
      
      terminalSessions.delete(sessionId);
    }
  }
}, 60000); // Check every minute

// ==========================================
// Start Server
// ==========================================
httpServer.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
});

// ==========================================
// Graceful Shutdown
// ==========================================
process.on('SIGINT', async () => {
  console.log('Shutting down WebSocket server...');
  
  // Close all terminal sessions
  for (const [sessionId, session] of terminalSessions.entries()) {
    if (session.sessionType === 'pty') {
      closePTYShellSession(sessionId);
    } else {
      closeShellSession(session.shellSessionId);
    }
  }
  
  await prisma.$disconnect();
  io.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  
  for (const [sessionId, session] of terminalSessions.entries()) {
    if (session.sessionType === 'pty') {
      closePTYShellSession(sessionId);
    } else {
      closeShellSession(session.shellSessionId);
    }
  }
  
  await prisma.$disconnect();
  io.close();
  httpServer.close();
  process.exit(0);
});

export { io };