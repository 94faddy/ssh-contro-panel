import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

// GET /api/settings/registration-status - Check if registration is enabled
export async function GET(request: NextRequest) {
  try {
    let enabled = true; // Default to true
    
    try {
      const settingsRecord = await prisma.systemSettings.findFirst({
        where: { key: 'system' }
      });
      
      if (settingsRecord) {
        const settings = settingsRecord.value as any;
        enabled = settings.enableRegistration !== false;
      }
    } catch (e) {
      // If table doesn't exist, default to enabled
      enabled = true;
    }

    return NextResponse.json({
      enabled
    });

  } catch (error) {
    console.error('Check registration status error:', error);
    // Default to enabled on error
    return NextResponse.json({
      enabled: true
    });
  }
}