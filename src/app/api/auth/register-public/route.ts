import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { validateEmail } from '@/lib/utils';
import type { RegisterData, ApiResponse, User } from '@/types';

// POST /api/auth/register-public - Public registration (if enabled)
export async function POST(request: NextRequest) {
  try {
    // Check if registration is enabled
    let registrationEnabled = true; // Default to true
    
    try {
      const settingsRecord = await prisma.systemSettings.findFirst({
        where: { key: 'system' }
      });
      
      if (settingsRecord) {
        const settings = settingsRecord.value as any;
        registrationEnabled = settings.enableRegistration !== false;
      }
    } catch (e) {
      // If table doesn't exist, default to enabled
      registrationEnabled = true;
    }

    if (!registrationEnabled) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Registration is currently disabled'
      }, { status: 403 });
    }

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

    if (name.length < 2) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Name must be at least 2 characters long'
      }, { status: 400 });
    }

    // For public registration, always set role to DEVELOPER
    // Admins can only be created by other admins
    const userRole = 'DEVELOPER';

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
        role: userRole,
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
      message: 'Registration successful'
    }, { status: 201 });

  } catch (error) {
    console.error('Public registration error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}