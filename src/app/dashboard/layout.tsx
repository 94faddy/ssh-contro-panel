import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - SSH Control Panel',
  description: 'Server management dashboard',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}