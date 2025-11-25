import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, generateToken, checkRateLimit } from '@/lib/auth';
import type { LoginCredentials, ApiResponse, User } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    
    // Rate limiting: 5 attempts per minute per IP
    if (!checkRateLimit(`login-${clientIP}`, 5, 60000)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Too many login attempts. Please try again later.'
      }, { status: 429 });
    }

    const body = await request.json() as LoginCredentials;
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Email and password are required'
      }, { status: 400 });
    }

    // Authenticate user
    const user = await authenticateUser(email, password);
    
    if (!user) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid email or password'
      }, { status: 401 });
    }

    // Generate token
    const token = generateToken(user);

    return NextResponse.json<ApiResponse<{ user: User; token: string }>>({
      success: true,
      data: {
        user,
        token
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}