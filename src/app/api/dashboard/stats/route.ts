import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User, DashboardStats } from '@/types';

export const GET = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const userId = request.user.id;
    const isAdmin = request.user.role === 'ADMIN';

    // Build where clause for user's data
    const userFilter = isAdmin ? {} : { userId };

    // Get server statistics
    const [
      totalServers,
      connectedServers,
      disconnectedServers,
      totalScripts,
      runningScripts,
      successfulScripts
    ] = await Promise.all([
      // Total servers
      prisma.server.count({
        where: userFilter
      }),
      
      // Connected servers
      prisma.server.count({
        where: {
          ...userFilter,
          status: 'CONNECTED'
        }
      }),
      
      // Disconnected servers
      prisma.server.count({
        where: {
          ...userFilter,
          status: { in: ['DISCONNECTED', 'ERROR'] }
        }
      }),
      
      // Total scripts (last 30 days)
      prisma.scriptLog.count({
        where: {
          ...userFilter,
          startTime: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      }),
      
      // Running scripts
      prisma.scriptLog.count({
        where: {
          ...userFilter,
          status: 'RUNNING'
        }
      }),
      
      // Successful scripts (last 30 days)
      prisma.scriptLog.count({
        where: {
          ...userFilter,
          status: 'SUCCESS',
          startTime: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    // Calculate success rate
    const successRate = totalScripts > 0 ? (successfulScripts / totalScripts) * 100 : 0;

    const stats: DashboardStats = {
      totalServers,
      connectedServers,
      disconnectedServers,
      runningScripts,
      totalScripts,
      successRate
    };

    return NextResponse.json<ApiResponse<DashboardStats>>({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch dashboard statistics'
    }, { status: 500 });
  }
});