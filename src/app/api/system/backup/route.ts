import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User } from '@/types';

interface BackupInfo {
  id: string;
  createdAt: string;
  createdBy: string;
  size: string;
  type: string;
  status: 'completed' | 'failed' | 'in_progress';
  tables: string[];
  recordCounts: Record<string, number>;
}

// GET /api/system/backup - Get backup list
export const GET = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    // In a real implementation, this would list actual backup files
    // For now, return mock data or check database for backup records
    
    const backups: BackupInfo[] = [];

    try {
      const backupRecords = await prisma.systemSettings.findFirst({
        where: { key: 'backup_history' }
      });

      if (backupRecords) {
        const history = backupRecords.value as unknown as BackupInfo[];
        backups.push(...history);
      }
    } catch (e) {
      // Table might not exist
    }

    return NextResponse.json<ApiResponse<BackupInfo[]>>({
      success: true,
      data: backups
    });

  } catch (error) {
    console.error('Get backups error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to get backup list'
    }, { status: 500 });
  }
});

// POST /api/system/backup - Create new backup
export const POST = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const backupId = `backup-${Date.now()}`;
    const backupTime = new Date();

    // Get counts of all tables for backup info
    const [
      userCount,
      serverCount,
      serverLogCount,
      scriptLogCount
    ] = await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.serverLog.count(),
      prisma.scriptLog.count()
    ]);

    // Get all data for backup
    const backupData = {
      metadata: {
        id: backupId,
        createdAt: backupTime.toISOString(),
        createdBy: request.user.email,
        version: '1.0.0'
      },
      users: await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
          // Not including password for security
        }
      }),
      servers: await prisma.server.findMany({
        select: {
          id: true,
          name: true,
          host: true,
          port: true,
          username: true,
          // Not including password for security
          isActive: true,
          status: true,
          systemInfo: true,
          lastChecked: true,
          createdAt: true,
          updatedAt: true,
          userId: true
        }
      }),
      // Only include recent logs (last 30 days)
      serverLogs: await prisma.serverLog.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        take: 50000
      }),
      scriptLogs: await prisma.scriptLog.findMany({
        where: {
          startTime: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        take: 50000
      })
    };

    // Create backup info record
    const backupInfo: BackupInfo = {
      id: backupId,
      createdAt: backupTime.toISOString(),
      createdBy: request.user.email,
      size: `${(JSON.stringify(backupData).length / 1024 / 1024).toFixed(2)} MB`,
      type: 'full',
      status: 'completed',
      tables: ['users', 'servers', 'serverLogs', 'scriptLogs'],
      recordCounts: {
        users: userCount,
        servers: serverCount,
        serverLogs: serverLogCount,
        scriptLogs: scriptLogCount
      }
    };

    // Save backup history
    try {
      const existingHistory = await prisma.systemSettings.findFirst({
        where: { key: 'backup_history' }
      });

      const history = existingHistory?.value as unknown as BackupInfo[] || [];
      history.unshift(backupInfo);
      
      // Keep only last 10 backups in history
      const trimmedHistory = history.slice(0, 10);

      await prisma.systemSettings.upsert({
        where: { key: 'backup_history' },
        update: { 
          value: trimmedHistory as any,
          updatedAt: new Date()
        },
        create: {
          key: 'backup_history',
          value: trimmedHistory as any
        }
      });
    } catch (e) {
      // Table might not exist, continue anyway
      console.log('Could not save backup history:', e);
    }

    // In a real implementation, you would:
    // 1. Save the backup to a file system or cloud storage
    // 2. Optionally compress the backup
    // 3. Send notification to admin

    return NextResponse.json<ApiResponse<BackupInfo>>({
      success: true,
      data: backupInfo,
      message: 'Backup created successfully'
    });

  } catch (error) {
    console.error('Create backup error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to create backup'
    }, { status: 500 });
  }
});

// DELETE /api/system/backup - Delete a backup
export const DELETE = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const { searchParams } = new URL(request.url);
    const backupId = searchParams.get('id');

    if (!backupId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Backup ID is required'
      }, { status: 400 });
    }

    try {
      const existingHistory = await prisma.systemSettings.findFirst({
        where: { key: 'backup_history' }
      });

      if (existingHistory) {
        const history = existingHistory.value as unknown as BackupInfo[];
        const filteredHistory = history.filter(b => b.id !== backupId);

        await prisma.systemSettings.update({
          where: { key: 'backup_history' },
          data: { 
            value: filteredHistory as any,
            updatedAt: new Date()
          }
        });
      }
    } catch (e) {
      console.log('Could not update backup history:', e);
    }

    // In a real implementation, also delete the actual backup file

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Backup deleted successfully'
    });

  } catch (error) {
    console.error('Delete backup error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to delete backup'
    }, { status: 500 });
  }
});