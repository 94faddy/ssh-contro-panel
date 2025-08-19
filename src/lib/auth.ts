import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from './database';
import type { User } from '@/types';

const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-change-this';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// Generate JWT token
export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Compare password
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Get user from token
export async function getUserFromToken(token: string): Promise<User | null> {
  try {
    const payload = verifyToken(token);
    if (!payload) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) return null;

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Get user from token failed:', error);
    return null;
  }
}

// Authenticate user
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) return null;

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'ADMIN' | 'DEVELOPER',
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Authentication failed:', error);
    return null;
  }
}

// Middleware for protecting routes
export function withAuth(handler: Function) {
  return async (request: NextRequest, context?: any) => {
    try {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return NextResponse.json({
          success: false,
          error: 'No token provided'
        }, { status: 401 });
      }

      const user = await getUserFromToken(token);
      
      if (!user) {
        return NextResponse.json({
          success: false,
          error: 'Invalid or expired token'
        }, { status: 401 });
      }

      // Add user to request
      const extendedRequest = request as NextRequest & { user: User };
      extendedRequest.user = user;

      return handler(extendedRequest, context);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json({
        success: false,
        error: 'Authentication error'
      }, { status: 500 });
    }
  };
}

// Middleware for admin only
export function withAdminAuth(handler: Function) {
  return withAuth(async (request: NextRequest & { user: User }, context?: any) => {
    if (request.user.role !== 'ADMIN') {
      return NextResponse.json({
        success: false,
        error: 'Admin access required'
      }, { status: 403 });
    }
    return handler(request, context);
  });
}

// Check if user can access server
export async function canAccessServer(userId: number, serverId: number): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return false;

    // Admin can access all servers
    if (user.role === 'ADMIN') return true;

    // Check if server belongs to user
    const server = await prisma.server.findUnique({
      where: { id: serverId }
    });

    return server?.userId === userId;
  } catch (error) {
    console.error('Access check failed:', error);
    return false;
  }
}

// Rate limiting utilities
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

// Session management for WebSocket
const activeSessions = new Map<string, { userId: number; serverId: number; lastActivity: number }>();

export function createSession(sessionId: string, userId: number, serverId: number) {
  activeSessions.set(sessionId, {
    userId,
    serverId,
    lastActivity: Date.now()
  });
}

export function getSession(sessionId: string) {
  return activeSessions.get(sessionId);
}

export function updateSessionActivity(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

export function removeSession(sessionId: string) {
  activeSessions.delete(sessionId);
}

export function cleanupInactiveSessions(timeoutMs: number = 300000) { // 5 minutes
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActivity > timeoutMs) {
      activeSessions.delete(sessionId);
    }
  }
}

// Auto cleanup every 5 minutes
setInterval(() => {
  cleanupRateLimit();
  cleanupInactiveSessions();
}, 300000);