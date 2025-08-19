import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { testSSHConnection } from '@/lib/ssh';
import { validateIP, validatePort } from '@/lib/utils';
import type { ApiResponse, User, Server, CreateServerData, ServerFilter, PaginatedResponse } from '@/types';

// GET /api/servers - Get user's servers with filtering and pagination
export const GET = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') as any;
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'name';
    const sortOrder = searchParams.get('sortOrder') || 'asc';

    const userId = request.user.id;
    const isAdmin = request.user.role === 'ADMIN';

    // Build where clause
    const where: any = {};
    
    // Non-admin users can only see their own servers
    if (!isAdmin) {
      where.userId = userId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { host: { contains: search } },
        { username: { contains: search } }
      ];
    }

    // Get total count
    const total = await prisma.server.count({ where });

    // Get servers with pagination
    const servers = await prisma.server.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc'
      },
      skip: (page - 1) * limit,
      take: limit,
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

    const serversData: Server[] = servers.map(server => ({
      ...server,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
      lastChecked: server.lastChecked?.toISOString(),
      systemInfo: server.systemInfo as any
    }));

    return NextResponse.json<PaginatedResponse<Server>>({
      success: true,
      data: serversData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get servers error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch servers'
    }, { status: 500 });
  }
});

// POST /api/servers - Create new server
export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as CreateServerData;
    const { name, host, port = 22, username, password } = body;

    // Validate input
    if (!name || !host || !username || !password) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Name, host, username, and password are required'
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
    const connectionTest = await testSSHConnection(host, port, username, password);
    
    if (!connectionTest.success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: `SSH connection failed: ${connectionTest.error}`
      }, { status: 400 });
    }

    // Create server
    const newServer = await prisma.server.create({
      data: {
        name,
        host,
        port,
        username,
        password, // In production, encrypt this
        status: 'CONNECTED',
        systemInfo: connectionTest.systemInfo as any,
        lastChecked: new Date(),
        userId: request.user.id
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
      ...newServer,
      createdAt: newServer.createdAt.toISOString(),
      updatedAt: newServer.updatedAt.toISOString(),
      lastChecked: newServer.lastChecked?.toISOString(),
      systemInfo: newServer.systemInfo as any
    };

    return NextResponse.json<ApiResponse<Server>>({
      success: true,
      data: serverData,
      message: 'Server created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Create server error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to create server'
    }, { status: 500 });
  }
});