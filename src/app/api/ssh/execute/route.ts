import { NextRequest, NextResponse } from 'next/server';
import { withAuth, canAccessServer } from '@/lib/auth';
import { executeCommand } from '@/lib/ssh';
import type { ApiResponse, User } from '@/types';

interface ExecuteCommandData {
  serverId: number;
  command: string;
  timeout?: number;
  cwd?: string;
}

export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as ExecuteCommandData;
    const { serverId, command, timeout, cwd } = body;

    // Validate input
    if (!serverId || !command) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Server ID and command are required'
      }, { status: 400 });
    }

    // Check access
    if (!await canAccessServer(request.user.id, serverId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied to this server'
      }, { status: 403 });
    }

    // Security check - prevent dangerous commands
    const dangerousCommands = [
      'rm -rf /',
      'rm -rf *',
      'mkfs',
      'dd if=/dev/zero',
      'format',
      'fdisk',
      'parted',
      ':(){ :|:& };:'  // fork bomb
    ];

    const lowerCommand = command.toLowerCase();
    if (dangerousCommands.some(dangerous => lowerCommand.includes(dangerous))) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Command contains potentially dangerous operations'
      }, { status: 400 });
    }

    // Execute command
    const result = await executeCommand(serverId, request.user.id, command, {
      timeout,
      cwd
    });

    return NextResponse.json<ApiResponse<{
      stdout: string;
      stderr: string;
      exitCode: number;
      command: string;
      serverId: number;
    }>>({
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code || 0,
        command,
        serverId
      },
      message: 'Command executed successfully'
    });

  } catch (error) {
    console.error('Execute command error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute command'
    }, { status: 500 });
  }
});