import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withAdminAuth, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { validateEmail } from '@/lib/utils';
import type { ApiResponse, User, PaginatedResponse } from '@/types';

interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'DEVELOPER';
}

interface UpdateUserData {
  name?: string;
  email?: string;
  password?: string;
  role?: 'ADMIN' | 'DEVELOPER';
  isActive?: boolean;
}

// GET /api/users - Get all users (Admin only)
export const GET = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') as 'ADMIN' | 'DEVELOPER' | null;
    const status = searchParams.get('status') as 'ACTIVE' | 'INACTIVE' | null;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } }
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status === 'ACTIVE') {
      where.isActive = true;
    } else if (status === 'INACTIVE') {
      where.isActive = false;
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get users with pagination
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
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

    const usersData: User[] = users.map(user => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    }));

    return NextResponse.json<PaginatedResponse<User>>({
      success: true,
      data: usersData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch users'
    }, { status: 500 });
  }
});

// POST /api/users - Create new user (Admin only)
export const POST = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as CreateUserData;
    const { name, email, password, role } = body;

    // Validate input
    if (!name || !email || !password || !role) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Name, email, password, and role are required'
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
        error: 'Invalid role'
      }, { status: 400 });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Email already exists'
      }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        isActive: true
      },
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
      ...newUser,
      createdAt: newUser.createdAt.toISOString(),
      updatedAt: newUser.updatedAt.toISOString()
    };

    return NextResponse.json<ApiResponse<User>>({
      success: true,
      data: userData,
      message: 'User created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to create user'
    }, { status: 500 });
  }
});