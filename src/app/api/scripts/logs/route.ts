import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User, ScriptLog, PaginatedResponse } from '@/types';

export const GET = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') as any;
    const serverId = searchParams.get('serverId');
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sortBy = searchParams.get('sortBy') || 'startTime';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const userId = request.user.id;
    const isAdmin = request.user.role === 'ADMIN';

    // Build where clause
    const where: any = {};
    
    // Non-admin users can only see their own logs
    if (!isAdmin) {
      where.userId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (serverId) {
      where.serverId = parseInt(serverId);
    }

    if (search) {
      where.OR = [
        { scriptName: { contains: search } },
        { command: { contains: search } }
      ];
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    // Get total count
    const total = await prisma.scriptLog.count({ where });

    // Get script logs with pagination
    const scriptLogs = await prisma.scriptLog.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc'
      },
      skip: (page - 1) * limit,
      take: limit,
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
      }
    });

    const logsData = scriptLogs.map(log => ({
      id: log.id,
      scriptName: log.scriptName,
      command: log.command,
      status: log.status,
      output: log.output || undefined,
      error: log.error || undefined,
      startTime: log.startTime.toISOString(),
      endTime: log.endTime?.toISOString(),
      duration: log.duration || undefined,
      userId: log.userId,
      serverId: log.serverId,
      server: {
        id: log.serverId,
        name: log.server.name,
        host: log.server.host,
        port: 22,
        username: '',
        isActive: true,
        status: 'DISCONNECTED' as any,
        createdAt: '',
        updatedAt: '',
        userId: log.userId
      }
    }));

    return NextResponse.json<PaginatedResponse<any>>({
      success: true,
      data: logsData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get script logs error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch script logs'
    }, { status: 500 });
  }
});