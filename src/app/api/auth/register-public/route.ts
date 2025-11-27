import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/database';
import { validateEmail } from '@/lib/utils';
import type { RegisterData, ApiResponse, User } from '@/types';

// POST /api/auth/register-public - Public registration (if enabled)
export async function POST(request: NextRequest) {
  try {
    // Check if registration is enabled
    let registrationEnabled = false; // Default to false for security
    
    try {
      // ใช้ findUnique แทน findFirst
      const settingsRecord = await prisma.systemSettings.findUnique({
        where: { key: 'system' }
      });
      
      if (settingsRecord) {
        const settings = settingsRecord.value as any;
        // ตรวจสอบว่า enableRegistration เป็น true explicitly
        registrationEnabled = settings.enableRegistration === true;
      }
    } catch (e) {
      console.error('Error checking registration settings:', e);
      // If table doesn't exist or error, default to disabled
      registrationEnabled = false;
    }

    if (!registrationEnabled) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'การสมัครสมาชิกถูกปิดใช้งานอยู่ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ'
      }, { status: 403 });
    }

    const body = await request.json() as RegisterData;
    const { email, password, name } = body;

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'กรุณากรอกอีเมล รหัสผ่าน และชื่อให้ครบถ้วน'
      }, { status: 400 });
    }

    if (!validateEmail(email)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'รูปแบบอีเมลไม่ถูกต้อง'
      }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
      }, { status: 400 });
    }

    if (name.length < 2) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร'
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
        error: 'อีเมลนี้ถูกใช้งานแล้ว'
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
      message: 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ'
    }, { status: 201 });

  } catch (error) {
    console.error('Public registration error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง'
    }, { status: 500 });
  }
}