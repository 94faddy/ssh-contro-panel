import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User } from '@/types';

export interface QuickCommand {
  id: number;
  name: string;
  command: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuickCommandData {
  name: string;
  command: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}

// GET /api/quick-commands - Get user's quick commands
export const GET = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // Build where clause
    const where: any = { userId };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { command: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const quickCommands = await prisma.quickCommand.findMany({
      where,
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ]
    });

    const commandsData: QuickCommand[] = quickCommands.map(cmd => ({
      id: cmd.id,
      name: cmd.name,
      command: cmd.command,
      description: cmd.description || undefined,
      category: cmd.category || undefined,
      color: cmd.color || 'gray',
      icon: cmd.icon || undefined,
      sortOrder: cmd.sortOrder,
      isActive: cmd.isActive,
      userId: cmd.userId,
      createdAt: cmd.createdAt.toISOString(),
      updatedAt: cmd.updatedAt.toISOString()
    }));

    return NextResponse.json<ApiResponse<QuickCommand[]>>({
      success: true,
      data: commandsData
    });

  } catch (error) {
    console.error('Get quick commands error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch quick commands'
    }, { status: 500 });
  }
});

// POST /api/quick-commands - Create new quick command
export const POST = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const userId = request.user.id;
    const body = await request.json() as CreateQuickCommandData;
    const { name, command, description, category, color, icon, sortOrder } = body;

    // Validate input
    if (!name || !name.trim()) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Name is required'
      }, { status: 400 });
    }

    if (!command || !command.trim()) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Command is required'
      }, { status: 400 });
    }

    // Check for duplicate name
    const existingCommand = await prisma.quickCommand.findFirst({
      where: {
        userId,
        name: name.trim()
      }
    });

    if (existingCommand) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'A quick command with this name already exists'
      }, { status: 409 });
    }

    // Get max sort order
    const maxSortOrder = await prisma.quickCommand.aggregate({
      where: { userId },
      _max: { sortOrder: true }
    });

    const newSortOrder = sortOrder ?? ((maxSortOrder._max.sortOrder || 0) + 1);

    // Create quick command
    const newQuickCommand = await prisma.quickCommand.create({
      data: {
        name: name.trim(),
        command: command.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        color: color || 'gray',
        icon: icon || null,
        sortOrder: newSortOrder,
        isActive: true,
        userId
      }
    });

    const commandData: QuickCommand = {
      id: newQuickCommand.id,
      name: newQuickCommand.name,
      command: newQuickCommand.command,
      description: newQuickCommand.description || undefined,
      category: newQuickCommand.category || undefined,
      color: newQuickCommand.color || 'gray',
      icon: newQuickCommand.icon || undefined,
      sortOrder: newQuickCommand.sortOrder,
      isActive: newQuickCommand.isActive,
      userId: newQuickCommand.userId,
      createdAt: newQuickCommand.createdAt.toISOString(),
      updatedAt: newQuickCommand.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<QuickCommand>>({
      success: true,
      data: commandData,
      message: 'Quick command created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Create quick command error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to create quick command'
    }, { status: 500 });
  }
});