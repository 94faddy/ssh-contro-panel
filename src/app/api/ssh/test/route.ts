import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { validateIP, validatePort } from '@/lib/utils';
import type { ApiResponse, User, SystemInfo } from '@/types';

interface TestConnectionData {
  host: string;
  port?: number;
  username: string;
  password: string;
}

async function testSSHConnection(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string; systemInfo?: SystemInfo }> {
  try {
    // Import node-ssh dynamically to avoid server-side issues
    const { NodeSSH } = await import('node-ssh');
    const ssh = new NodeSSH();
    
    await ssh.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 10000,
      algorithms: {
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
        serverHostKey: ['ssh-rsa', 'ssh-ed25519']
      }
    });

    // Get basic system information
    const [osInfo, uptime, memInfo] = await Promise.all([
      ssh.execCommand('uname -s -r -m'),
      ssh.execCommand('uptime'),
      ssh.execCommand('cat /proc/meminfo | head -n 2')
    ]);

    const systemInfo: SystemInfo = {
      os: osInfo.stdout.split(' ')[0] || 'Linux',
      arch: osInfo.stdout.split(' ')[2] || 'x86_64',
      platform: 'linux',
      uptime: 0,
      loadAverage: [0, 0, 0],
      totalMemory: 0,
      freeMemory: 0,
      cpuCount: 1
    };
    
    await ssh.dispose();
    
    return { success: true, systemInfo };
  } catch (error) {
    console.error('SSH connection test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}

export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as TestConnectionData;
    const { host, port = 22, username, password } = body;

    // Validate input
    if (!host || !username || !password) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Host, username, and password are required'
      }, { status: 400 });
    }

    if (!validateIP(host) && !host.includes('.')) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid host or IP address'
      }, { status: 400 });
    }

    if (!validatePort(port)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Port must be between 1 and 65535'
      }, { status: 400 });
    }

    // Test SSH connection
    const result = await testSSHConnection(host, port, username, password);

    if (!result.success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: result.error || 'Connection test failed'
      }, { status: 400 });
    }

    return NextResponse.json<ApiResponse<{
      connectionSuccess: boolean;
      systemInfo?: SystemInfo;
    }>>({
      success: true,
      data: {
        connectionSuccess: true,
        systemInfo: result.systemInfo
      },
      message: 'SSH connection test successful'
    });

  } catch (error) {
    console.error('SSH test error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Connection test failed'
    }, { status: 500 });
  }
});