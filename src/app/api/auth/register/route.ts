import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, generateToken, withAdminAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { validateEmail } from '@/lib/utils';
import type { RegisterData, ApiResponse, User } from '@/types';

export const POST = withAdminAuth(async (request: NextRequest) => {
  try {
    const body = await request.json() as RegisterData;
    const { email, password, name, role = 'DEVELOPER' } = body;

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Email, password, and name are required'
      }, { status: 400 });
    }

    if (!validateEmail(email)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Password must be at least 6 characters long'
      }, { status: 400 });
    }

    if (!['ADMIN', 'DEVELOPER'].includes(role)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid role specified'
      }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'User with this email already exists'
      }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role as 'ADMIN' | 'DEVELOPER',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const user: User = {
      ...newUser,
      createdAt: newUser.createdAt.toISOString(),
      updatedAt: newUser.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: user,
      message: 'User created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
});