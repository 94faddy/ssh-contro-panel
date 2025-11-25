import { NextRequest, NextResponse } from 'next/server';
import { withAuth, canAccessServer } from '@/lib/auth';
import { executeCommand } from '@/lib/ssh';
import { prisma } from '@/lib/database';
import type { ApiResponse, User, RunScriptData } from '@/types';

export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as RunScriptData;
    const { scriptName, command, serverIds } = body;

    // Validate input
    if (!scriptName || !command || !serverIds || serverIds.length === 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Script name, command, and server IDs are required'
      }, { status: 400 });
    }

    if (serverIds.length > 50) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Maximum 50 servers can be selected at once'
      }, { status: 400 });
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

    // Check access to all servers
    const accessChecks = await Promise.all(
      serverIds.map(serverId => canAccessServer(request.user.id, serverId))
    );

    if (accessChecks.some(canAccess => !canAccess) && request.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied to one or more servers'
      }, { status: 403 });
    }

    // Get server details
    const servers = await prisma.server.findMany({
      where: {
        id: { in: serverIds },
        ...(request.user.role !== 'ADMIN' ? { userId: request.user.id } : {})
      },
      select: {
        id: true,
        name: true,
        host: true,
        status: true
      }
    });

    if (servers.length !== serverIds.length) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'One or more servers not found'
      }, { status: 404 });
    }

    // Create script logs for each server
    const scriptLogs = await Promise.all(
      servers.map(server => 
        prisma.scriptLog.create({
          data: {
            scriptName,
            command,
            status: 'RUNNING',
            userId: request.user.id,
            serverId: server.id,
            startTime: new Date()
          }
        })
      )
    );

    // Execute script on all servers in parallel
    const executions = servers.map(async (server, index) => {
      try {
        const startTime = Date.now();
        const result = await executeCommand(server.id, request.user.id, command, { timeout: 300000 }); // 5 minutes timeout
        const duration = Math.floor((Date.now() - startTime) / 1000);

        // Update script log
        await prisma.scriptLog.update({
          where: { id: scriptLogs[index].id },
          data: {
            status: result.code === 0 ? 'SUCCESS' : 'FAILED',
            output: result.stdout,
            error: result.stderr,
            endTime: new Date(),
            duration
          }
        });

        return {
          serverId: server.id,
          serverName: server.name,
          success: result.code === 0,
          exitCode: result.code,
          output: result.stdout,
          error: result.stderr,
          duration
        };
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

        return {
          serverId: server.id,
          serverName: server.name,
          success: false,
          exitCode: -1,
          output: '',
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0
        };
      }
    });

    // Wait for all executions to complete
    const results = await Promise.all(executions);

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    return NextResponse.json<ApiResponse<{
      executionId: string;
      scriptName: string;
      command: string;
      totalServers: number;
      successCount: number;
      failedCount: number;
      results: typeof results;
    }>>({
      success: true,
      data: {
        executionId: `${request.user.id}-${Date.now()}`,
        scriptName,
        command,
        totalServers: results.length,
        successCount,
        failedCount,
        results
      },
      message: `Script executed on ${results.length} servers. ${successCount} successful, ${failedCount} failed.`
    });

  } catch (error) {
    console.error('Run script error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to execute script'
    }, { status: 500 });
  }
});