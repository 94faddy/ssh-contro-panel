import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User } from '@/types';
import os from 'os';

interface SystemInfoResponse {
  version: string;
  uptime: string;
  totalUsers: number;
  totalServers: number;
  totalConnections: number;
  memoryUsage: number;
  diskUsage: number;
  cpuUsage: number;
  lastBackup: string;
  databaseSize: string;
  nodeVersion: string;
  platform: string;
  hostname: string;
}

// GET /api/system/info - Get system information
export const GET = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    // Get database statistics
    const [
      totalUsers,
      totalServers,
      connectedServers,
      totalScriptLogs,
      totalServerLogs
    ] = await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.server.count({ where: { status: 'CONNECTED' } }),
      prisma.scriptLog.count(),
      prisma.serverLog.count()
    ]);

    // Calculate uptime
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptime = `${days} days, ${hours} hours, ${minutes} minutes`;

    // Get memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = Math.round(((totalMemory - freeMemory) / totalMemory) * 100);

    // Get CPU usage (simplified)
    const cpus = os.cpus();
    const cpuUsage = Math.round(
      cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
      }, 0) / cpus.length
    );

    // Get last backup time
    let lastBackup = 'ไม่มีข้อมูล';
    try {
      const backupHistory = await prisma.systemSettings.findFirst({
        where: { key: 'backup_history' }
      });
      if (backupHistory) {
        const history = backupHistory.value as any[];
        if (history && history.length > 0) {
          lastBackup = new Date(history[0].createdAt).toLocaleString('th-TH');
        }
      }
    } catch (e) {
      // Ignore if table doesn't exist
    }

    // Estimate database size based on record counts
    const estimatedRecords = totalUsers + totalServers + totalScriptLogs + totalServerLogs;
    const estimatedSize = Math.max(1, Math.round(estimatedRecords * 0.001)); // Rough estimate
    const databaseSize = estimatedRecords > 1000000 
      ? `${(estimatedSize / 1024).toFixed(1)} GB` 
      : `${estimatedSize} MB`;

    const systemInfo: SystemInfoResponse = {
      version: process.env.npm_package_version || '1.0.0',
      uptime,
      totalUsers,
      totalServers,
      totalConnections: connectedServers,
      memoryUsage,
      diskUsage: 0, // Would need to implement disk check
      cpuUsage,
      lastBackup,
      databaseSize,
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname()
    };

    return NextResponse.json<ApiResponse<SystemInfoResponse>>({
      success: true,
      data: systemInfo
    });

  } catch (error) {
    console.error('Get system info error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to get system information'
    }, { status: 500 });
  }
});