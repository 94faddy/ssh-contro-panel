'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Server, 
  Terminal, 
  FileText, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Home,
  Plus,
  Play,
  Activity
} from 'lucide-react';
import Swal from 'sweetalert2';
import type { User } from '@/types';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navigation: NavItem[] = [
  { name: 'แดชบอร์ด', href: '/dashboard', icon: Home },
  { name: 'เซิร์ฟเวอร์', href: '/dashboard/servers', icon: Server },
  { name: 'เทอร์มินัล', href: '/dashboard/terminal', icon: Terminal },
  { name: 'รัน Scripts', href: '/dashboard/scripts', icon: Play },
  { name: 'บันทึกการทำงาน', href: '/dashboard/logs', icon: FileText },
  { name: 'ข้อมูลระบบ', href: '/dashboard/monitoring', icon: Activity },
  { name: 'ผู้ใช้งาน', href: '/dashboard/users', icon: Users, adminOnly: true },
  { name: 'การตั้งค่า', href: '/dashboard/settings', icon: Settings },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check authentication
    const token = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');

    if (!token) {
      router.push('/login');
      return;
    }

    if (userInfo) {
      try {
        setUser(JSON.parse(userInfo));
      } catch (error) {
        console.error('Error parsing user info:', error);
        handleLogout();
      }
    }

    // Verify token periodically
    verifyToken(token);
  }, []);

    const verifyToken = async (token: string) => {
    try {
        const response = await fetch('/api/auth/verify', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
        });

        if (!response.ok) {
        // เพิ่มการตรวจสอบว่าเป็น 404 หรือไม่
        if (response.status === 404) {
            console.error('API route not found');
            return; // ไม่ logout ถ้า API ยังไม่พร้อม
        }
        handleLogout();
        }
    } catch (error) {
        console.error('Token verification failed:', error);
        // ไม่ logout ถ้า network error
    }
    };

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: 'ออกจากระบบ?',
      text: 'คุณต้องการออกจากระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      
      await Swal.fire({
        title: 'ออกจากระบบสำเร็จ',
        text: 'ขอบคุณที่ใช้บริการ',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      router.push('/login');
    }
  };

  const filteredNavigation = navigation.filter(item => 
    !item.adminOnly || (user?.role === 'ADMIN')
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
            <Sidebar navigation={filteredNavigation} pathname={pathname} user={user} onLogout={handleLogout} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <Sidebar navigation={filteredNavigation} pathname={pathname} user={user} onLogout={handleLogout} />
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        {/* Top navigation */}
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-white shadow">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

interface SidebarProps {
  navigation: NavItem[];
  pathname: string;
  user: User;
  onLogout: () => void;
}

function Sidebar({ navigation, pathname, user, onLogout }: SidebarProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white shadow-lg">
      {/* Logo */}
      <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4 mb-8">
          <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-blue-600">
            <Server className="h-6 w-6 text-white" />
          </div>
          <div className="ml-3">
            <h1 className="text-xl font-bold text-gray-900">SSH Panel</h1>
            <p className="text-xs text-gray-500">Control Center</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-5 flex-1 px-2 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            
            return (
              <a
                key={item.name}
                href={item.href}
                className={`${
                  isActive
                    ? 'bg-blue-100 border-r-2 border-blue-600 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-150`}
              >
                <Icon
                  className={`${
                    isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                  } mr-3 flex-shrink-0 h-5 w-5`}
                />
                {item.name}
              </a>
            );
          })}
        </nav>
      </div>

      {/* User info and logout */}
      <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
        <div className="flex-shrink-0 w-full group block">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                {user.name}
              </p>
              <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700">
                {user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'นักพัฒนา'}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="ml-3 p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150"
              title="ออกจากระบบ"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}