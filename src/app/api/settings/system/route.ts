import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth';
import { prisma } from '@/lib/database';
import type { ApiResponse, User } from '@/types';

interface SystemSettings {
  siteName: string;
  siteDescription: string;
  maxServersPerUser: number;
  sessionTimeout: number;
  maxFileUploadSize: number;
  enableRegistration: boolean;
  enableEmailNotifications: boolean;
  enableSyslogExport: boolean;
  defaultUserRole: 'ADMIN' | 'DEVELOPER';
  backupRetentionDays: number;
  logRetentionDays: number;
}

// Default system settings
const DEFAULT_SETTINGS: SystemSettings = {
  siteName: 'SSH Control Panel',
  siteDescription: 'Web-based SSH control panel for managing multiple servers',
  maxServersPerUser: 10,
  sessionTimeout: 3600,
  maxFileUploadSize: 10,
  enableRegistration: false, // Default to false for security
  enableEmailNotifications: true,
  enableSyslogExport: true,
  defaultUserRole: 'DEVELOPER',
  backupRetentionDays: 30,
  logRetentionDays: 90
};

// GET /api/settings/system - Get system settings
export const GET = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    // Try to get settings from database - ใช้ findUnique แทน findFirst
    const settingsRecord = await prisma.systemSettings.findUnique({
      where: { key: 'system' }
    });

    if (settingsRecord) {
      // Merge with defaults to ensure all fields exist
      const savedSettings = settingsRecord.value as unknown as Partial<SystemSettings>;
      const mergedSettings: SystemSettings = { ...DEFAULT_SETTINGS, ...savedSettings };
      
      return NextResponse.json<ApiResponse<SystemSettings>>({
        success: true,
        data: mergedSettings
      });
    }

    // Return default settings if none exist
    return NextResponse.json<ApiResponse<SystemSettings>>({
      success: true,
      data: DEFAULT_SETTINGS
    });

  } catch (error) {
    console.error('Get system settings error:', error);
    // Return defaults on error (table might not exist yet)
    return NextResponse.json<ApiResponse<SystemSettings>>({
      success: true,
      data: DEFAULT_SETTINGS
    });
  }
});

// PUT /api/settings/system - Update system settings
export const PUT = withAdminAuth(async (request: NextRequest & { user: User }) => {
  try {
    const body = await request.json() as Partial<SystemSettings>;

    // Validate settings
    if (body.maxServersPerUser !== undefined && (body.maxServersPerUser < 1 || body.maxServersPerUser > 100)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Maximum servers per user must be between 1 and 100'
      }, { status: 400 });
    }

    if (body.sessionTimeout !== undefined && (body.sessionTimeout < 300 || body.sessionTimeout > 86400)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Session timeout must be between 300 and 86400 seconds'
      }, { status: 400 });
    }

    if (body.maxFileUploadSize !== undefined && (body.maxFileUploadSize < 1 || body.maxFileUploadSize > 1024)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Maximum file upload size must be between 1 and 1024 MB'
      }, { status: 400 });
    }

    if (body.defaultUserRole !== undefined && !['ADMIN', 'DEVELOPER'].includes(body.defaultUserRole)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'Invalid default user role'
      }, { status: 400 });
    }

    try {
      // Get current settings - ใช้ findUnique
      const currentSettings = await prisma.systemSettings.findUnique({
        where: { key: 'system' }
      });

      const currentValue = currentSettings?.value as unknown as SystemSettings || DEFAULT_SETTINGS;
      const newSettings: SystemSettings = { ...currentValue, ...body };

      // Log the change for debugging
      console.log('Updating system settings:', {
        previous: currentValue.enableRegistration,
        new: newSettings.enableRegistration
      });

      // Upsert settings - ใช้ unique key
      await prisma.systemSettings.upsert({
        where: { key: 'system' },
        update: { 
          value: newSettings as any,
          updatedAt: new Date()
        },
        create: {
          key: 'system',
          value: newSettings as any
        }
      });

      return NextResponse.json<ApiResponse<SystemSettings>>({
        success: true,
        data: newSettings,
        message: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว'
      });
    } catch (dbError) {
      console.error('Database operation failed:', dbError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองใหม่อีกครั้ง'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Update system settings error:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: 'Failed to update system settings'
    }, { status: 500 });
  }
});