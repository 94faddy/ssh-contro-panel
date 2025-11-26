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

export interface UpdateQuickCommandData {
  name?: string;
  command?: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface RouteParams {
  params: { id: string };
}

// GET /api/quick-commands/[id] - Get quick command by ID
export const GET = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const userId = request.user.id;
    const commandId = parseInt(params.id);

    if (isNaN(commandId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid command ID'
      }, { status: 400 });
    }

    const quickCommand = await prisma.quickCommand.findFirst({
      where: {
        id: commandId,
        userId
      }
    });

    if (!quickCommand) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Quick command not found'
      }, { status: 404 });
    }

    const commandData: QuickCommand = {
      id: quickCommand.id,
      name: quickCommand.name,
      command: quickCommand.command,
      description: quickCommand.description || undefined,
      category: quickCommand.category || undefined,
      color: quickCommand.color || 'gray',
      icon: quickCommand.icon || undefined,
      sortOrder: quickCommand.sortOrder,
      isActive: quickCommand.isActive,
      userId: quickCommand.userId,
      createdAt: quickCommand.createdAt.toISOString(),
      updatedAt: quickCommand.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<QuickCommand>>({
      success: true,
      data: commandData
    });

  } catch (error) {
    console.error('Get quick command error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch quick command'
    }, { status: 500 });
  }
});

// PUT /api/quick-commands/[id] - Update quick command
export const PUT = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const userId = request.user.id;
    const commandId = parseInt(params.id);

    if (isNaN(commandId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid command ID'
      }, { status: 400 });
    }

    // Check if quick command exists and belongs to user
    const existingCommand = await prisma.quickCommand.findFirst({
      where: {
        id: commandId,
        userId
      }
    });

    if (!existingCommand) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Quick command not found'
      }, { status: 404 });
    }

    const body = await request.json() as UpdateQuickCommandData;
    const { name, command, description, category, color, icon, sortOrder, isActive } = body;

    // Validate name if provided
    if (name !== undefined && !name.trim()) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Name cannot be empty'
      }, { status: 400 });
    }

    // Validate command if provided
    if (command !== undefined && !command.trim()) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Command cannot be empty'
      }, { status: 400 });
    }

    // Check for duplicate name (if changing name)
    if (name && name.trim() !== existingCommand.name) {
      const duplicateCommand = await prisma.quickCommand.findFirst({
        where: {
          userId,
          name: name.trim(),
          id: { not: commandId }
        }
      });

      if (duplicateCommand) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'A quick command with this name already exists'
        }, { status: 409 });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (command !== undefined) updateData.command = command.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (category !== undefined) updateData.category = category?.trim() || null;
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Update quick command
    const updatedCommand = await prisma.quickCommand.update({
      where: { id: commandId },
      data: updateData
    });

    const commandData: QuickCommand = {
      id: updatedCommand.id,
      name: updatedCommand.name,
      command: updatedCommand.command,
      description: updatedCommand.description || undefined,
      category: updatedCommand.category || undefined,
      color: updatedCommand.color || 'gray',
      icon: updatedCommand.icon || undefined,
      sortOrder: updatedCommand.sortOrder,
      isActive: updatedCommand.isActive,
      userId: updatedCommand.userId,
      createdAt: updatedCommand.createdAt.toISOString(),
      updatedAt: updatedCommand.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<QuickCommand>>({
      success: true,
      data: commandData,
      message: 'Quick command updated successfully'
    });

  } catch (error) {
    console.error('Update quick command error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to update quick command'
    }, { status: 500 });
  }
});

// DELETE /api/quick-commands/[id] - Delete quick command
export const DELETE = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const userId = request.user.id;
    const commandId = parseInt(params.id);

    if (isNaN(commandId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid command ID'
      }, { status: 400 });
    }

    // Check if quick command exists and belongs to user
    const existingCommand = await prisma.quickCommand.findFirst({
      where: {
        id: commandId,
        userId
      }
    });

    if (!existingCommand) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Quick command not found'
      }, { status: 404 });
    }

    // Delete quick command
    await prisma.quickCommand.delete({
      where: { id: commandId }
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      message: 'Quick command deleted successfully'
    });

  } catch (error) {
    console.error('Delete quick command error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to delete quick command'
    }, { status: 500 });
  }
});