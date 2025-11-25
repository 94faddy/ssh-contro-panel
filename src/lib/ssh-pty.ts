/**
 * SSH PTY Functions - Used only by WebSocket server (not bundled by Next.js)
 * This file uses ssh2 directly for real PTY support
 */

import { Client, ClientChannel } from 'ssh2';
import { prisma } from './database';

// PTY Shell sessions using ssh2 directly
interface PTYSession {
  client: Client;
  stream: ClientChannel;
  serverId: number;
  userId: number;
  cwd: string;
  cols: number;
  rows: number;
  onData?: (data: string) => void;
  onClose?: () => void;
}

const ptyShellSessions = new Map<string, PTYSession>();

/**
 * Create a real PTY shell session using ssh2 directly
 */
export async function createPTYShellSession(
  serverId: number,
  userId: number,
  sessionId: string,
  options: { cols?: number; rows?: number } = {}
): Promise<{ success: boolean; error?: string; cwd?: string }> {
  try {
    // Get server details
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server || server.userId !== userId) {
      return { success: false, error: 'Server not found or access denied' };
    }

    const cols = options.cols || 120;
    const rows = options.rows || 30;

    return new Promise((resolve) => {
      const client = new Client();
      
      const timeout = setTimeout(() => {
        client.end();
        resolve({ success: false, error: 'Connection timeout' });
      }, 15000);

      client.on('ready', () => {
        clearTimeout(timeout);
        
        // Request a PTY shell
        client.shell({
          term: 'xterm-256color',
          cols,
          rows,
          modes: {
            ECHO: 1,
            ICANON: 1,
            ISIG: 1,
            IEXTEN: 1,
            ICRNL: 1,
            OPOST: 1,
            ONLCR: 1
          }
        }, (err, stream) => {
          if (err) {
            client.end();
            resolve({ success: false, error: err.message });
            return;
          }

          // Store session
          ptyShellSessions.set(sessionId, {
            client,
            stream,
            serverId,
            userId,
            cwd: '~',
            cols,
            rows
          });

          // Handle stream close
          stream.on('close', () => {
            const session = ptyShellSessions.get(sessionId);
            if (session?.onClose) {
              session.onClose();
            }
            closePTYShellSession(sessionId);
          });

          resolve({ success: true, cwd: '~' });
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: err.message });
      });

      // Connect to server
      client.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
        readyTimeout: 15000,
        algorithms: {
          kex: [
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group1-sha1'
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr', 
            'aes256-ctr',
            'aes128-cbc',
            'aes256-cbc'
          ],
          hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512',
            'hmac-sha1'
          ],
          serverHostKey: [
            'ssh-rsa',
            'ssh-ed25519',
            'ecdsa-sha2-nistp256'
          ]
        }
      });
    });
  } catch (error) {
    console.error('Failed to create PTY session:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Set up data and close handlers for PTY session
 */
export function setPTYSessionHandlers(
  sessionId: string,
  onData: (data: string) => void,
  onClose: () => void
): boolean {
  const session = ptyShellSessions.get(sessionId);
  if (!session) return false;

  session.onData = onData;
  session.onClose = onClose;

  // Set up data handler
  session.stream.on('data', (data: Buffer) => {
    if (session.onData) {
      session.onData(data.toString('utf8'));
    }
  });

  return true;
}

/**
 * Write data to PTY session (handles raw input including Ctrl+C)
 */
export function writeToPTYSession(sessionId: string, data: string): boolean {
  const session = ptyShellSessions.get(sessionId);
  if (!session || !session.stream) return false;

  try {
    session.stream.write(data);
    return true;
  } catch (error) {
    console.error('Error writing to PTY session:', error);
    return false;
  }
}

/**
 * Resize PTY session window
 */
export function resizePTYSession(
  sessionId: string,
  cols: number,
  rows: number
): boolean {
  const session = ptyShellSessions.get(sessionId);
  if (!session || !session.stream) return false;

  try {
    session.stream.setWindow(rows, cols, 0, 0);
    session.cols = cols;
    session.rows = rows;
    return true;
  } catch (error) {
    console.error('Error resizing PTY session:', error);
    return false;
  }
}

/**
 * Close PTY shell session
 */
export function closePTYShellSession(sessionId: string): void {
  const session = ptyShellSessions.get(sessionId);
  if (!session) return;

  try {
    if (session.stream) {
      session.stream.end();
    }
    if (session.client) {
      session.client.end();
    }
  } catch (error) {
    console.error('Error closing PTY session:', error);
  }

  ptyShellSessions.delete(sessionId);
}

/**
 * Get PTY session info
 */
export function getPTYSessionInfo(sessionId: string): { 
  cwd: string; 
  cols: number; 
  rows: number 
} | null {
  const session = ptyShellSessions.get(sessionId);
  if (!session) return null;

  return {
    cwd: session.cwd,
    cols: session.cols,
    rows: session.rows
  };
}

/**
 * Check if PTY session exists
 */
export function hasPTYSession(sessionId: string): boolean {
  return ptyShellSessions.has(sessionId);
}

/**
 * Get all active PTY session IDs
 */
export function getActivePTYSessions(): string[] {
  return Array.from(ptyShellSessions.keys());
}

/**
 * Cleanup all PTY sessions
 */
export function cleanupAllPTYSessions(): void {
  for (const sessionId of ptyShellSessions.keys()) {
    closePTYShellSession(sessionId);
  }
}