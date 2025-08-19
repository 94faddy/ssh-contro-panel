import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withAdminAuth, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { validateEmail } from '@/lib/utils';
import type { ApiResponse, User } from '@/types';

interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
  role?: 'ADMIN' | 'DEVELOPER';
  isActive?: boolean;
}

interface RouteParams {
  params: { id: string };
}

// GET /api/users/[id] - Get user by ID
export const GET = withAdminAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const userId = parseInt(params.id);
    
    if (isNaN(userId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid user ID'
      }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    const userData: User = {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch user'
    }, { status: 500 });
  }
});

// PUT /api/users/[id] - Update user
export const PUT = withAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const userId = parseInt(params.id);
    const requestingUser = request.user;
    
    if (isNaN(userId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid user ID'
      }, { status: 400 });
    }

    // Check if user can update this profile
    if (requestingUser.role !== 'ADMIN' && requestingUser.id !== userId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Access denied'
      }, { status: 403 });
    }

    const body = await request.json() as UpdateUserData;
    const { name, email, password, role, isActive } = body;

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!currentUser) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    // Validate input
    if (email && !validateEmail(email)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 });
    }

    if (password && password.length < 6) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Password must be at least 6 characters long'
      }, { status: 400 });
    }

    if (role && !['ADMIN', 'DEVELOPER'].includes(role)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid role'
      }, { status: 400 });
    }

    // Only admins can change role and isActive
    if (requestingUser.role !== 'ADMIN') {
      if (role !== undefined || isActive !== undefined) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Only administrators can change user role or status'
        }, { status: 403 });
      }
    }

    // Check if email already exists (if changing email)
    if (email && email !== currentUser.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Email already exists'
        }, { status: 409 });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (password) updateData.password = await hashPassword(password);
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const userData: User = {
      ...updatedUser,
      createdAt: updatedUser.createdAt.toISOString(),
      updatedAt: updatedUser.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: userData,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to update user'
    }, { status: 500 });
  }
});

// DELETE /api/users/[id] - Delete user (Admin only)
export const DELETE = withAdminAuth(async (request: NextRequest & { user: User }, { params }: RouteParams) => {
  try {
    const userId = parseInt(params.id);
    const requestingUser = request.user;
    
    if (isNaN(userId)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid user ID'
      }, { status: 400 });
    }

    // Prevent self-deletion
    if (requestingUser.id === userId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Cannot delete your own account'
      }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    // Check if user has servers - transfer or delete them
    const userServers = await prisma.server.count({
      where: { userId }
    });

    if (userServers > 0) {
      // Option 1: Transfer servers to requesting admin
      await prisma.server.updateMany({
        where: { userId },
        data: { userId: requestingUser.id }
      });

      // Option 2: Delete all user servers (uncomment if preferred)
      // await prisma.server.deleteMany({
      //   where: { userId }
      // });
    }

    // Delete user
    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      message: userServers > 0 
        ? 'User deleted successfully. Their servers have been transferred to you.'
        : 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to delete user'
    }, { status: 500 });
  }
});