import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SSH Control Panel',
  description: 'Web-based SSH control panel for managing multiple Ubuntu servers',
  keywords: ['SSH', 'Control Panel', 'Ubuntu', 'Server Management'],
  authors: [{ name: 'SSH Control Panel Team' }],
  // ลบ viewport ออกจากตรงนี้
};

// เพิ่ม viewport export แยกออกมา (ตาม Next.js 14)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50 antialiased`}>
        <div id="root" className="h-full">
          {children}
        </div>
        <div id="modal-root" />
        <div id="toast-root" />
      </body>
    </html>
  );
}