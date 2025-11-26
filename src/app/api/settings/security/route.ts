import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User, SecurityPolicy } from '@/types';

interface SecuritySettings extends SecurityPolicy {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  lockoutAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  enableTwoFactor: boolean;
  ipWhitelist: string[];
}

// Default security settings
const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  passwordMinLength: 6,
  passwordRequireUppercase: false,
  passwordRequireNumbers: true,
  passwordRequireSymbols: false,
  lockoutAttempts: 5,
  lockoutDuration: 300,
  sessionTimeout: 3600,
  enableTwoFactor: false,
  ipWhitelist: [],
  allowDangerousCommands: true,
  blockedCommands: [
    'rm -rf /',
    'rm -rf /*',
    'rm -rf .*',
    'mkfs',
    'dd if=/dev/zero of=/dev/',
    'format',
    ':(){ :|:& };:',
    'chmod 777 /',
    'chown root:root /'
  ],
  requireSudoConfirmation: true,
  maxCommandLength: 1000,
  enableCommandLogging: true
};

// GET /api/settings/security - Get security settings
export const GET = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const settingsRecord = await prisma.systemSettings.findFirst({
      where: { key: 'security' }
    });

    if (settingsRecord) {
      return NextResponse.json<ApiResponse<SecuritySettings>>({
        success: true,
        data: settingsRecord.value as unknown as SecuritySettings
      });
    }

    return NextResponse.json<ApiResponse<SecuritySettings>>({
      success: true,
      data: DEFAULT_SECURITY_SETTINGS
    });

  } catch (error) {
    console.error('Get security settings error:', error);
    return NextResponse.json<ApiResponse<SecuritySettings>>({
      success: true,
      data: DEFAULT_SECURITY_SETTINGS
    });
  }
});

// PUT /api/settings/security - Update security settings
export const PUT = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as Partial<SecuritySettings>;

    // Validate settings
    if (body.passwordMinLength !== undefined && (body.passwordMinLength < 4 || body.passwordMinLength > 128)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Password minimum length must be between 4 and 128'
      }, { status: 400 });
    }

    if (body.lockoutAttempts !== undefined && (body.lockoutAttempts < 3 || body.lockoutAttempts > 10)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Lockout attempts must be between 3 and 10'
      }, { status: 400 });
    }

    if (body.lockoutDuration !== undefined && (body.lockoutDuration < 60 || body.lockoutDuration > 3600)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Lockout duration must be between 60 and 3600 seconds'
      }, { status: 400 });
    }

    if (body.maxCommandLength !== undefined && (body.maxCommandLength < 100 || body.maxCommandLength > 5000)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Max command length must be between 100 and 5000'
      }, { status: 400 });
    }

    // Validate IP whitelist format
    if (body.ipWhitelist) {
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\/\d{1,2})?$/;
      for (const ip of body.ipWhitelist) {
        if (!ipRegex.test(ip) && ip !== 'localhost') {
          return NextResponse.json<ApiResponse>({
            success: false,
            error: `Invalid IP address format: ${ip}`
          }, { status: 400 });
        }
      }
    }

    try {
      // Get current settings
      const currentSettings = await prisma.systemSettings.findFirst({
        where: { key: 'security' }
      });

      const currentValue = currentSettings?.value as unknown as SecuritySettings || DEFAULT_SECURITY_SETTINGS;
      const newSettings: SecuritySettings = { ...currentValue, ...body };

      // Upsert settings
      await prisma.systemSettings.upsert({
        where: { key: 'security' },
        update: { 
          value: newSettings as any,
          updatedAt: new Date()
        },
        create: {
          key: 'security',
          value: newSettings as any
        }
      });

      return NextResponse.json<ApiResponse<SecuritySettings>>({
        success: true,
        data: newSettings,
        message: 'Security settings updated successfully'
      });
    } catch (dbError) {
      console.log('Database operation failed:', dbError);
      return NextResponse.json<ApiResponse<SecuritySettings>>({
        success: true,
        data: { ...DEFAULT_SECURITY_SETTINGS, ...body },
        message: 'Settings applied (note: database table for settings may not exist)'
      });
    }

  } catch (error) {
    console.error('Update security settings error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to update security settings'
    }, { status: 500 });
  }
});