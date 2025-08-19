import { NodeSSH, SSHExecCommandResponse } from 'node-ssh';
import { prisma } from './database';
import type { Server, SystemInfo, DiskUsage } from '@/types';
import bcrypt from 'bcryptjs';
import { postprocessOutput } from './command-middleware';

// SSH connection pool
const sshConnections = new Map<string, NodeSSH>();

// Active shell sessions
const shellSessions = new Map<string, {
  ssh: NodeSSH;
  cwd: string;
  env: Record<string, string>;
  userId: number;
  serverId: number;
}>();

// Create SSH connection key
function getConnectionKey(serverId: number, userId: number): string {
  return `${serverId}-${userId}`;
}

// Encrypt password for storage
export async function encryptPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Decrypt password (in real implementation, use proper encryption)
export async function decryptPassword(encrypted: string, original?: string): Promise<string> {
  // In production, implement proper decryption
  // For now, we'll assume the password is stored encrypted with bcrypt
  return original || encrypted;
}

// Test SSH connection
export async function testSSHConnection(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; systemInfo?: SystemInfo }> {
  const ssh = new NodeSSH();
  
  try {
    await ssh.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
        serverHostKey: ['ssh-rsa', 'ssh-ed25519']
      }
    });

    // Get system information
    const systemInfo = await getSystemInfo(ssh);
    
    await ssh.dispose();
    
    return { success: true, systemInfo };
  } catch (error) {
    await ssh.dispose();
    console.error('SSH connection test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}

// Get or create SSH connection
export async function getSSHConnection(
  serverId: number,
  userId: number,
  forceNew: boolean = false
): Promise<NodeSSH | null> {
  const connectionKey = getConnectionKey(serverId, userId);
  
  // Return existing connection if available and not forcing new
  if (!forceNew && sshConnections.has(connectionKey)) {
    const existingConnection = sshConnections.get(connectionKey)!;
    try {
      // Test if connection is still alive
      await existingConnection.execCommand('echo "test"', [], { execOptions: { timeout: 5000 } });
      return existingConnection;
    } catch {
      // Connection is dead, remove it
      sshConnections.delete(connectionKey);
      try {
        await existingConnection.dispose();
      } catch { /* ignore */ }
    }
  }

  try {
    // Get server details
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server || server.userId !== userId) {
      throw new Error('Server not found or access denied');
    }

    const ssh = new NodeSSH();
    
    await ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password, // In production, decrypt this
      readyTimeout: 15000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
        serverHostKey: ['ssh-rsa', 'ssh-ed25519']
      }
    });

    // Store connection
    sshConnections.set(connectionKey, ssh);

    // Update server status
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: 'CONNECTED',
        lastChecked: new Date(),
      },
    });

    return ssh;
  } catch (error) {
    console.error('SSH connection failed:', error);
    
    // Update server status to error
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: 'ERROR',
        lastChecked: new Date(),
      },
    });

    return null;
  }
}

// Create shell session
export async function createShellSession(
  serverId: number,
  userId: number,
  sessionId: string
): Promise<boolean> {
  try {
    const ssh = await getSSHConnection(serverId, userId);
    if (!ssh) return false;

    // Get initial working directory and environment with proper TERM setting
    const [pwdResult, envResult] = await Promise.all([
      ssh.execCommand('pwd'),
      ssh.execCommand('echo "TERM=${TERM:-xterm-256color}"; env')
    ]);

    const cwd = pwdResult.stdout.trim() || '/';
    const env: Record<string, string> = {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      DEBIAN_FRONTEND: 'noninteractive' // Prevent interactive prompts
    };
    
    // Parse environment variables and merge with defaults
    envResult.stdout.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
      }
    });

    // Ensure TERM is always set
    env.TERM = env.TERM || 'xterm-256color';
    env.DEBIAN_FRONTEND = 'noninteractive';

    // Store shell session
    shellSessions.set(sessionId, {
      ssh,
      cwd,
      env,
      userId,
      serverId
    });

    return true;
  } catch (error) {
    console.error('Failed to create shell session:', error);
    return false;
  }
}

// Execute command in shell session
export async function executeShellCommand(
  sessionId: string,
  command: string,
  options: { timeout?: number } = {}
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
}> {
  const session = shellSessions.get(sessionId);
  if (!session) {
    throw new Error('Shell session not found');
  }

  try {
    // Handle built-in commands
    if (command.trim().startsWith('cd ')) {
      return await handleCdCommand(sessionId, command);
    }

    // Handle clear command specially
    if (command.trim() === 'clear') {
      return {
        stdout: '\x1b[2J\x1b[H', // ANSI clear screen sequence
        stderr: '',
        exitCode: 0,
        cwd: session.cwd
      };
    }

    // Ensure proper environment is set for all commands
    const envVars = {
      ...session.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      DEBIAN_FRONTEND: 'noninteractive',
      COLUMNS: '120',
      LINES: '30'
    };

    // Build environment string
    const envString = Object.entries(envVars)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    // Prepare command with proper environment and directory
    const fullCommand = `cd "${session.cwd}" && ${envString} ${command}`;
    
    const result = await session.ssh.execCommand(fullCommand, [], {
      execOptions: {
        timeout: options.timeout || 30000,
        env: envVars,
        // Enable pseudo-TTY for better command support
        pty: {
          cols: 120,
          rows: 30
        }
      }
    });

    // Update current working directory if command might have changed it
    if (command.includes('cd ') || command.includes('pushd ') || command.includes('popd ')) {
      try {
        const pwdResult = await session.ssh.execCommand(`cd "${session.cwd}" && ${command} && pwd`);
        if (pwdResult.code === 0) {
          session.cwd = pwdResult.stdout.trim() || session.cwd;
        }
      } catch {
        // Ignore pwd update errors
      }
    }

    // Post-process output to remove warnings and clean up
    const processedStdout = postprocessOutput(result.stdout, command);
    const processedStderr = postprocessOutput(result.stderr, command);

    // Log command execution
    await prisma.serverLog.create({
      data: {
        serverId: session.serverId,
        logType: 'COMMAND',
        message: `Executed: ${command}`,
        data: {
          command,
          exitCode: result.code,
          stdout: processedStdout,
          stderr: processedStderr,
          cwd: session.cwd
        },
      },
    });

    return {
      stdout: processedStdout,
      stderr: processedStderr,
      exitCode: result.code || 0,
      cwd: session.cwd
    };
  } catch (error) {
    // Log error
    await prisma.serverLog.create({
      data: {
        serverId: session.serverId,
        logType: 'ERROR',
        message: `Command failed: ${command}`,
        data: {
          command,
          error: error instanceof Error ? error.message : 'Unknown error',
          cwd: session.cwd
        },
      },
    });

    throw error;
  }
}

// Handle cd command
async function handleCdCommand(sessionId: string, command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
}> {
  const session = shellSessions.get(sessionId);
  if (!session) {
    throw new Error('Shell session not found');
  }

  const args = command.trim().split(/\s+/);
  let targetDir = args[1] || session.env.HOME || '/';

  // Handle special cases
  if (targetDir === '~') {
    targetDir = session.env.HOME || '/';
  } else if (targetDir.startsWith('~/')) {
    targetDir = (session.env.HOME || '/') + targetDir.substring(1);
  } else if (!targetDir.startsWith('/')) {
    // Relative path
    targetDir = `${session.cwd}/${targetDir}`;
  }

  try {
    // Test if directory exists and is accessible
    const result = await session.ssh.execCommand(`cd "${targetDir}" && pwd`);
    
    if (result.code === 0) {
      session.cwd = result.stdout.trim();
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        cwd: session.cwd
      };
    } else {
      return {
        stdout: '',
        stderr: result.stderr || `cd: ${targetDir}: No such file or directory`,
        exitCode: 1,
        cwd: session.cwd
      };
    }
  } catch (error) {
    return {
      stdout: '',
      stderr: `cd: ${targetDir}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      exitCode: 1,
      cwd: session.cwd
    };
  }
}

// Close shell session
export function closeShellSession(sessionId: string): void {
  shellSessions.delete(sessionId);
}

// Get shell session info
export function getShellSessionInfo(sessionId: string): { cwd: string; env: Record<string, string> } | null {
  const session = shellSessions.get(sessionId);
  if (!session) return null;
  
  return {
    cwd: session.cwd,
    env: session.env
  };
}

// Close SSH connection
export async function closeSSHConnection(serverId: number, userId: number): Promise<void> {
  const connectionKey = getConnectionKey(serverId, userId);
  const connection = sshConnections.get(connectionKey);
  
  if (connection) {
    try {
      await connection.dispose();
    } catch (error) {
      console.error('Error disposing SSH connection:', error);
    }
    sshConnections.delete(connectionKey);
  }

  // Close all shell sessions for this connection
  for (const [sessionId, session] of shellSessions.entries()) {
    if (session.serverId === serverId && session.userId === userId) {
      shellSessions.delete(sessionId);
    }
  }

  // Update server status
  await prisma.server.update({
    where: { id: serverId },
    data: {
      status: 'DISCONNECTED',
      lastChecked: new Date(),
    },
  });
}

// Execute command on server (legacy function for backward compatibility)
export async function executeCommand(
  serverId: number,
  userId: number,
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): Promise<SSHExecCommandResponse> {
  const ssh = await getSSHConnection(serverId, userId);
  
  if (!ssh) {
    throw new Error('Failed to establish SSH connection');
  }

  try {
    // Set environment variables to avoid interactive prompts
    const envVars = {
      DEBIAN_FRONTEND: 'noninteractive',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    };

    const result = await ssh.execCommand(command, [], {
      execOptions: {
        timeout: options.timeout || 30000,
        env: envVars
      },
      cwd: options.cwd,
    });

    // Post-process output to remove warnings
    const processedStdout = postprocessOutput(result.stdout, command);
    const processedStderr = postprocessOutput(result.stderr, command);

    // Log command execution
    await prisma.serverLog.create({
      data: {
        serverId,
        logType: 'COMMAND',
        message: `Executed: ${command}`,
        data: {
          command,
          exitCode: result.code,
          stdout: processedStdout,
          stderr: processedStderr,
        },
      },
    });

    return {
      ...result,
      stdout: processedStdout,
      stderr: processedStderr
    };
  } catch (error) {
    // Log error
    await prisma.serverLog.create({
      data: {
        serverId,
        logType: 'ERROR',
        message: `Command failed: ${command}`,
        data: {
          command,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    });

    throw error;
  }
}

// Get system information - ใช้คำสั่งง่าย ๆ เหมือนที่คุณเช็ค
export async function getSystemInfo(ssh: NodeSSH): Promise<SystemInfo> {
  try {
    const [
      osInfo,
      uptime,
      loadAvg,
      memoryInfo,  // ใช้คำสั่งเดียวกับที่คุณเช็ค
      cpuInfo,
      diskInfo
    ] = await Promise.all([
      ssh.execCommand('uname -s -r -m'),
      ssh.execCommand('uptime -s && uptime'),
      ssh.execCommand('cat /proc/loadavg'),
      ssh.execCommand('free | awk \'/Mem:/ {print $2, $7}\''), // total, available
      ssh.execCommand('nproc'),
      ssh.execCommand('df -h --type=ext4 --type=ext3 --type=ext2 --type=xfs')
    ]);

    // Parse OS info
    const osData = osInfo.stdout.split(' ');
    const os = osData[0] || 'Unknown';
    const arch = osData[2] || 'Unknown';
    
    // Parse uptime
    const uptimeLines = uptime.stdout.split('\n');
    const uptimeSeconds = uptimeLines.length > 1 ? 
      parseUptimeFromString(uptimeLines[1]) : 0;

    // Parse load average
    const loadData = loadAvg.stdout.split(' ');
    const loadAverage = [
      parseFloat(loadData[0]) || 0,
      parseFloat(loadData[1]) || 0,
      parseFloat(loadData[2]) || 0
    ];

    // Parse memory info - ใช้วิธีง่าย ๆ ตรงกับที่คุณเช็ค
    let totalMemory = 0;
    let availableMemory = 0;
    
    if (memoryInfo.stdout) {
      const memData = memoryInfo.stdout.trim().split(' ');
      if (memData.length >= 2) {
        totalMemory = parseInt(memData[0]) * 1024;      // total (KB -> bytes)
        availableMemory = parseInt(memData[1]) * 1024;  // available (KB -> bytes)
      }
    }

    // Parse CPU count
    const cpuCount = parseInt(cpuInfo.stdout.trim()) || 1;

    // Parse disk usage
    const diskUsage = parseDiskUsage(diskInfo.stdout);

    // ส่งข้อมูลที่ถูกต้อง - ใช้ available เป็น freeMemory
    return {
      os,
      arch,
      platform: 'linux',
      uptime: uptimeSeconds,
      loadAverage,
      totalMemory,
      freeMemory: availableMemory, // ใช้ available memory
      cpuCount,
      diskUsage
    };
  } catch (error) {
    console.error('Failed to get system info:', error);
    throw error;
  }
}

// Helper function to parse uptime string
function parseUptimeFromString(uptimeStr: string): number {
  const match = uptimeStr.match(/up\s+(.+?),\s+\d+\s+user/);
  if (!match) return 0;

  const uptimeText = match[1];
  let seconds = 0;

  // Parse days
  const dayMatch = uptimeText.match(/(\d+)\s+day/);
  if (dayMatch) seconds += parseInt(dayMatch[1]) * 86400;

  // Parse hours and minutes
  const timeMatch = uptimeText.match(/(\d+):(\d+)/);
  if (timeMatch) {
    seconds += parseInt(timeMatch[1]) * 3600; // hours
    seconds += parseInt(timeMatch[2]) * 60;   // minutes
  }

  return seconds;
}

// Helper function to parse memory line
function parseMemoryLine(line: string): number {
  const match = line.match(/(\d+)\s+kB/);
  return match ? parseInt(match[1]) : 0;
}

// Helper function to parse disk usage
function parseDiskUsage(diskOutput: string): DiskUsage[] {
  const lines = diskOutput.trim().split('\n');
  const diskUsage: DiskUsage[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length >= 6) {
      diskUsage.push({
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parts[4],
        mountPoint: parts[5]
      });
    }
  }

  return diskUsage;
}

// Update server system info
export async function updateServerSystemInfo(serverId: number, userId: number): Promise<SystemInfo | null> {
  try {
    const ssh = await getSSHConnection(serverId, userId);
    if (!ssh) return null;

    const systemInfo = await getSystemInfo(ssh);

    await prisma.server.update({
      where: { id: serverId },
      data: {
        systemInfo: systemInfo as any,
        lastChecked: new Date(),
      },
    });

    return systemInfo;
  } catch (error) {
    console.error('Failed to update system info:', error);
    return null;
  }
}

// Cleanup inactive connections
export function cleanupSSHConnections(): void {
  // This should be called periodically to clean up inactive connections
  console.log(`Cleaning up SSH connections. Active: ${sshConnections.size}`);
  console.log(`Active shell sessions: ${shellSessions.size}`);
}

// Cleanup all connections on shutdown
export async function disposeAllSSHConnections(): Promise<void> {
  const promises = Array.from(sshConnections.values()).map(ssh => {
    return ssh.dispose().catch(err => {
      console.error('Error disposing SSH connection:', err);
    });
  });

  await Promise.all(promises);
  sshConnections.clear();
  shellSessions.clear();
}

// Auto cleanup every 10 minutes
setInterval(cleanupSSHConnections, 600000);