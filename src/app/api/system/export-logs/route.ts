import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { User } from '@/types';

// GET /api/system/export-logs - Export system logs
export const GET = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');
    const format = searchParams.get('format') || 'json';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get server logs
    const serverLogs = await prisma.serverLog.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      include: {
        server: {
          select: {
            name: true,
            host: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10000 // Limit to prevent memory issues
    });

    // Get script logs
    const scriptLogs = await prisma.scriptLog.findMany({
      where: {
        startTime: {
          gte: startDate
        }
      },
      include: {
        server: {
          select: {
            name: true,
            host: true
          }
        },
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        startTime: 'desc'
      },
      take: 10000
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: request.user.email,
      period: {
        from: startDate.toISOString(),
        to: new Date().toISOString(),
        days
      },
      statistics: {
        totalServerLogs: serverLogs.length,
        totalScriptLogs: scriptLogs.length,
        successfulScripts: scriptLogs.filter(s => s.status === 'SUCCESS').length,
        failedScripts: scriptLogs.filter(s => s.status === 'FAILED').length
      },
      serverLogs: serverLogs.map(log => ({
        id: log.id,
        serverId: log.serverId,
        serverName: log.server?.name || 'Unknown',
        serverHost: log.server?.host || 'Unknown',
        logType: log.logType,
        message: log.message,
        data: log.data,
        createdAt: log.createdAt.toISOString()
      })),
      scriptLogs: scriptLogs.map(log => ({
        id: log.id,
        scriptName: log.scriptName,
        command: log.command,
        status: log.status,
        output: log.output,
        error: log.error,
        serverId: log.serverId,
        serverName: log.server?.name || 'Unknown',
        userId: log.userId,
        userName: log.user?.name || 'Unknown',
        startTime: log.startTime.toISOString(),
        endTime: log.endTime?.toISOString(),
        duration: log.duration
      }))
    };

    if (format === 'csv') {
      // Generate CSV format
      const serverLogsCsv = [
        'ID,Server ID,Server Name,Server Host,Log Type,Message,Created At',
        ...serverLogs.map(log => 
          `${log.id},"${log.serverId}","${log.server?.name || ''}","${log.server?.host || ''}","${log.logType}","${(log.message || '').replace(/"/g, '""')}","${log.createdAt.toISOString()}"`
        )
      ].join('\n');

      const scriptLogsCsv = [
        'ID,Script Name,Command,Status,Server Name,User Name,Start Time,End Time,Duration',
        ...scriptLogs.map(log =>
          `${log.id},"${log.scriptName}","${(log.command || '').replace(/"/g, '""')}","${log.status}","${log.server?.name || ''}","${log.user?.name || ''}","${log.startTime.toISOString()}","${log.endTime?.toISOString() || ''}","${log.duration || ''}"`
        )
      ].join('\n');

      const csvContent = `=== Server Logs ===\n${serverLogsCsv}\n\n=== Script Logs ===\n${scriptLogsCsv}`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="system-logs-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Return JSON format
    const jsonContent = JSON.stringify(exportData, null, 2);

    return new NextResponse(jsonContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="system-logs-${new Date().toISOString().split('T')[0]}.json"`
      }
    });

  } catch (error) {
    console.error('Export logs error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to export logs'
    }, { status: 500 });
  }
});