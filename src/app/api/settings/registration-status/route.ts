import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

// GET /api/settings/registration-status - Check if registration is enabled
export async function GET(request: NextRequest) {
  try {
    let enabled = false; // เปลี่ยน default เป็น false เพื่อความปลอดภัย
    
    try {
      // ใช้ findUnique แทน findFirst เพราะ key เป็น unique
      const settingsRecord = await prisma.systemSettings.findUnique({
        where: { key: 'system' }
      });
      
      if (settingsRecord) {
        const settings = settingsRecord.value as any;
        // ตรวจสอบว่า enableRegistration เป็น true หรือไม่
        enabled = settings.enableRegistration === true;
      } else {
        // ถ้าไม่มี record ให้ default เป็น false
        enabled = false;
      }
    } catch (e) {
      console.error('Error checking registration status:', e);
      // ถ้า table ไม่มีหรือ error ให้ default เป็น false เพื่อความปลอดภัย
      enabled = false;
    }

    return NextResponse.json({
      success: true,
      enabled
    });

  } catch (error) {
    console.error('Check registration status error:', error);
    // Default to disabled on error for security
    return NextResponse.json({
      success: false,
      enabled: false
    });
  }
}