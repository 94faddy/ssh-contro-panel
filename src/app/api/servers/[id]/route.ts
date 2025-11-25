import { NextRequest, NextResponse } from 'next/server';
import { withAuth, canAccessServer } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { testSSHConnection, closeSSHConnection, updateServerSystemInfo } from '@/lib/ssh';
import { validateIP, validatePort } from '@/lib/utils';
import type { ApiResponse, User, Server, UpdateServerData } from '@/types';

interface RouteParams {
  params: { id: string };
}

// GET /api/servers/[id] - Get server by ID
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
    if (!await canAccessServer(request.user.id, serverId) && request.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied to this server'
      }, { status: 403 });
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        username: true,
        isActive: true,
        status: true,
        lastChecked: true,
        systemInfo: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!server) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Server not found'
      }, { status: 404 });
    }

    const serverData: Server = {
      ...server,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
      lastChecked: server.lastChecked?.toISOString(),
      systemInfo: server.systemInfo as any
    };

    return NextResponse.json<ApiResponse<Server>>({
      success: true,
      data: serverData
    });

  } catch (error) {
    console.error('Get server error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch server'
    }, { status: 500 });
  }
});

// PUT /api/servers/[id] - Update server
export const PUT = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const serverId = parseInt(params.id);
    
    if (isNaN(serverId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid server ID'
      }, { status: 400 });
    }

    // Check access
    if (!await canAccessServer(request.user.id, serverId) && request.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied to this server'
      }, { status: 403 });
    }

    const body = await request.json() as UpdateServerData;
    const { name, host, port, username, password, isActive } = body;

    // Validate input if provided
    if (host && !validateIP(host) && !host.includes('.')) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid host or IP address'
      }, { status: 400 });
    }

    if (port && !validatePort(port)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Port must be between 1 and 65535'
      }, { status: 400 });
    }

    // Get current server data
    const currentServer = await prisma.server.findUnique({
      where: { id: serverId }
    });

    if (!currentServer) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Server not found'
      }, { status: 404 });
    }

    // Test connection if credentials changed
    let systemInfo = currentServer.systemInfo;
    if (host || port || username || password) {
      const testHost = host || currentServer.host;
      const testPort = port || currentServer.port;
      const testUsername = username || currentServer.username;
      const testPassword = password || currentServer.password;

      const connectionTest = await testSSHConnection(testHost, testPort, testUsername, testPassword);
      
      if (!connectionTest.success) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: `SSH connection failed: ${connectionTest.error}`
        }, { status: 400 });
      }

      systemInfo = connectionTest.systemInfo as any;

      // Close old connection if credentials changed
      await closeSSHConnection(serverId, request.user.id);
    }

    // Update server
    const updatedServer = await prisma.server.update({
      where: { id: serverId },
      data: {
        ...(name && { name }),
        ...(host && { host }),
        ...(port && { port }),
        ...(username && { username }),
        ...(password && { password }),
        ...(isActive !== undefined && { isActive }),
        ...(systemInfo && { systemInfo }),
        ...(systemInfo && { lastChecked: new Date() })
      },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        username: true,
        isActive: true,
        status: true,
        lastChecked: true,
        systemInfo: true,
        createdAt: true,
        updatedAt: true,
        userId: true
      }
    });

    const serverData: Server = {
      ...updatedServer,
      createdAt: updatedServer.createdAt.toISOString(),
      updatedAt: updatedServer.updatedAt.toISOString(),
      lastChecked: updatedServer.lastChecked?.toISOString(),
      systemInfo: updatedServer.systemInfo as any
    };

    return NextResponse.json<ApiResponse<Server>>({
      success: true,
      data: serverData,
      message: 'Server updated successfully'
    });

  } catch (error) {
    console.error('Update server error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to update server'
    }, { status: 500 });
  }
});

// DELETE /api/servers/[id] - Delete server
export const DELETE = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const serverId = parseInt(params.id);
    
    if (isNaN(serverId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid server ID'
      }, { status: 400 });
    }

    // Check access
    if (!await canAccessServer(request.user.id, serverId) && request.user.role !== 'ADMIN') {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied to this server'
      }, { status: 403 });
    }

    // Close SSH connection
    await closeSSHConnection(serverId, request.user.id);

    // Delete server (cascading deletes will handle logs)
    await prisma.server.delete({
      where: { id: serverId }
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Server deleted successfully'
    });

  } catch (error) {
    console.error('Delete server error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to delete server'
    }, { status: 500 });
  }
});