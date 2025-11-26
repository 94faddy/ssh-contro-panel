import { NextRequest, NextResponse } from 'next/server';
import { withAuth, hashPassword, comparePassword } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { validateEmail } from '@/lib/utils';
import type { ApiResponse, User } from '@/types';

interface UpdateProfileData {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

// GET /api/profile - Get current user profile
export const GET = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
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

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch profile'
    }, { status: 500 });
  }
});

// PUT /api/profile - Update current user profile
export const PUT = withAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as UpdateProfileData;
    const { name, email, currentPassword, newPassword } = body;

    const userId = request.user.id;

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

    // Validate email if provided
    if (email && !validateEmail(email)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 });
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

    // Validate password change
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Current password is required to change password'
        }, { status: 400 });
      }

      // Verify current password
      const isPasswordValid = await comparePassword(currentPassword, currentUser.password);
      if (!isPasswordValid) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Current password is incorrect'
        }, { status: 401 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'New password must be at least 6 characters long'
        }, { status: 400 });
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (newPassword) updateData.password = await hashPassword(newPassword);

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

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: {
        ...updatedUser,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString()
      },
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to update profile'
    }, { status: 500 });
  }
});