import { NextRequest, NextResponse } from 'next/server';
import { withAuth, canAccessServer } from '@/lib/auth';
import { updateServerSystemInfo } from '@/lib/ssh';
import { prisma } from '@/lib/database';
import type { ApiResponse, User, SystemInfo } from '@/types';

interface RouteParams {
  params: { id: string };
}

export const GET = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const serverId = parseInt(params.id);
    
    if (isNaN(serverId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid server ID'
      }, { status: 400 });
    }

    // Check access
    if (!await canAccessServer(request.user.id, serverId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied to this server'
      }, { status: 403 });
    }

    // Get current server status
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        status: true,
        lastChecked: true,
        systemInfo: true
      }
    });

    if (!server) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Server not found'
      }, { status: 404 });
    }

    // Try to update system info
    const systemInfo = await updateServerSystemInfo(serverId, request.user.id);

    // Get updated server status
    const updatedServer = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        status: true,
        lastChecked: true,
        systemInfo: true
      }
    });

    return NextResponse.json<ApiResponse<{
      serverId: number;
      serverName: string;
      status: string;
      lastChecked?: string;
      systemInfo?: SystemInfo;
    }>>({
      success: true,
      data: {
        serverId: updatedServer!.id,
        serverName: updatedServer!.name,
        status: updatedServer!.status,
        lastChecked: updatedServer!.lastChecked?.toISOString(),
        systemInfo: updatedServer!.systemInfo as SystemInfo
      },
      message: 'Server status updated'
    });

  } catch (error) {
    console.error('Get server status error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to get server status'
    }, { status: 500 });
  }
});