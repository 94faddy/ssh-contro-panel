import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Database connection test
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Initialize database with default admin user
export async function initializeDatabase() {
  try {
    // Check if admin user exists
    const adminExists = await prisma.user.findFirst({
      where: { email: process.env.ADMIN_EMAIL || 'admin@localhost' }
    });

    if (!adminExists) {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || 'admin123',
        12
      );

      await prisma.user.create({
        data: {
          email: process.env.ADMIN_EMAIL || 'admin@localhost',
          password: hashedPassword,
          name: 'System Administrator',
          role: 'ADMIN',
          isActive: true,
        },
      });

      console.log('✅ Default admin user created');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
}

// Graceful shutdown
export async function closeDatabaseConnection() {
  await prisma.$disconnect();
}

export default prisma;