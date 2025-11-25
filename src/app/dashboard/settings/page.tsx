'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  Shield, 
  Bell, 
  Database, 
  Server, 
  Lock,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle,
  Globe,
  Clock,
  HardDrive,
  Activity
} from 'lucide-react';
import Layout from '@/components/Layout';
import Swal from 'sweetalert2';
import type { User as UserType, ApiResponse } from '@/types';

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

interface SecuritySettings {
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

interface NotificationSettings {
  emailEnabled: boolean;
  emailHost: string;
  emailPort: number;
  emailUsername: string;
  emailPassword: string;
  emailFromAddress: string;
  enableServerAlerts: boolean;
  enableScriptAlerts: boolean;
  enableSecurityAlerts: boolean;
  alertThresholds: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  };
}

interface ProfileFormData {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function ProfileSettings() {
  const [user, setUser] = useState<UserType | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  useEffect(() => {
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        const userData = JSON.parse(userInfo);
        setUser(userData);
        setFormData(prev => ({
          ...prev,
          name: userData.name,
          email: userData.email
        }));
      } catch (error) {
        console.error('Error parsing user info:', error);
      }
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      Swal.fire({
        title: 'ข้อผิดพลาด',
        text: 'รหัสผ่านใหม่ไม่ตรงกัน',
        icon: 'error'
      });
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          ...(formData.newPassword && {
            currentPassword: formData.currentPassword,
            newPassword: formData.newPassword
          })
        })
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        // Update local user info
        const updatedUser = { ...user!, name: formData.name, email: formData.email };
        localStorage.setItem('user_info', JSON.stringify(updatedUser));
        setUser(updatedUser);
        
        // Clear password fields
        setFormData(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));

        await Swal.fire({
          title: 'บันทึกสำเร็จ!',
          text: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        throw new Error(data.error || 'การอัปเดตล้มเหลว');
      }
    } catch (error) {
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: error instanceof Error ? error.message : 'ไม่สามารถอัปเดตข้อมูลได้',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-soft rounded-lg p-6">
      <div className="flex items-center mb-6">
        <User className="h-6 w-6 text-blue-600 mr-3" />
        <h3 className="text-lg font-medium text-gray-900">ข้อมูลโปรไฟล์</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name */}
          <div>
            <label className="form-label">ชื่อผู้ใช้งาน</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="form-input"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="form-label">อีเมล</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="form-input"
              required
            />
          </div>
        </div>

        {/* Password Section */}
        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">เปลี่ยนรหัสผ่าน</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Current Password */}
            <div>
              <label className="form-label">รหัสผ่านปัจจุบัน</label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleInputChange}
                  className="form-input pr-10"
                  placeholder="เว้นว่างหากไม่ต้องการเปลี่ยน"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                >
                  {showPasswords.current ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="form-label">รหัสผ่านใหม่</label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  className="form-input pr-10"
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                >
                  {showPasswords.new ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="form-input pr-10"
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                >
                  {showPasswords.confirm ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                บันทึกการเปลี่ยนแปลง
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function SystemSettingsPanel() {
  const [settings, setSettings] = useState<SystemSettings>({
    siteName: 'SSH Control Panel',
    siteDescription: 'Web-based SSH control panel for managing multiple servers',
    maxServersPerUser: 10,
    sessionTimeout: 3600,
    maxFileUploadSize: 10,
    enableRegistration: false,
    enableEmailNotifications: true,
    enableSyslogExport: true,
    defaultUserRole: 'DEVELOPER',
    backupRetentionDays: 30,
    logRetentionDays: 90
  });
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
               type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        await Swal.fire({
          title: 'บันทึกสำเร็จ!',
          text: 'อัปเดตการตั้งค่าระบบเรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        throw new Error(data.error || 'การอัปเดตล้มเหลว');
      }
    } catch (error) {
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: error instanceof Error ? error.message : 'ไม่สามารถอัปเดตการตั้งค่าได้',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-soft rounded-lg p-6">
      <div className="flex items-center mb-6">
        <Settings className="h-6 w-6 text-blue-600 mr-3" />
        <h3 className="text-lg font-medium text-gray-900">การตั้งค่าระบบ</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="form-label">ชื่อเว็บไซต์</label>
            <input
              type="text"
              name="siteName"
              value={settings.siteName}
              onChange={handleInputChange}
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label">คำอธิบายเว็บไซต์</label>
            <input
              type="text"
              name="siteDescription"
              value={settings.siteDescription}
              onChange={handleInputChange}
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label">จำนวนเซิร์ฟเวอร์สูงสุดต่อผู้ใช้</label>
            <input
              type="number"
              name="maxServersPerUser"
              value={settings.maxServersPerUser}
              onChange={handleInputChange}
              className="form-input"
              min="1"
              max="100"
            />
          </div>

          <div>
            <label className="form-label">ระยะเวลา Session (วินาที)</label>
            <input
              type="number"
              name="sessionTimeout"
              value={settings.sessionTimeout}
              onChange={handleInputChange}
              className="form-input"
              min="300"
              max="86400"
            />
          </div>

          <div>
            <label className="form-label">ขนาดไฟล์อัปโหลดสูงสุด (MB)</label>
            <input
              type="number"
              name="maxFileUploadSize"
              value={settings.maxFileUploadSize}
              onChange={handleInputChange}
              className="form-input"
              min="1"
              max="1024"
            />
          </div>

          <div>
            <label className="form-label">สิทธิผู้ใช้เริ่มต้น</label>
            <select
              name="defaultUserRole"
              value={settings.defaultUserRole}
              onChange={handleInputChange}
              className="form-input"
            >
              <option value="DEVELOPER">นักพัฒนา</option>
              <option value="ADMIN">ผู้ดูแลระบบ</option>
            </select>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">ฟีเจอร์</h4>
          
          <div className="space-y-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="enableRegistration"
                checked={settings.enableRegistration}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">เปิดใช้งานการสมัครสมาชิก</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="enableEmailNotifications"
                checked={settings.enableEmailNotifications}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">เปิดใช้งานการแจ้งเตือนทางอีเมล</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="enableSyslogExport"
                checked={settings.enableSyslogExport}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">เปิดใช้งานการส่งออก Syslog</span>
            </label>
          </div>
        </div>

        {/* Data Retention */}
        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">การเก็บรักษาข้อมูล</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">ระยะเวลาเก็บ Backup (วัน)</label>
              <input
                type="number"
                name="backupRetentionDays"
                value={settings.backupRetentionDays}
                onChange={handleInputChange}
                className="form-input"
                min="1"
                max="365"
              />
            </div>

            <div>
              <label className="form-label">ระยะเวลาเก็บ Log (วัน)</label>
              <input
                type="number"
                name="logRetentionDays"
                value={settings.logRetentionDays}
                onChange={handleInputChange}
                className="form-input"
                min="1"
                max="365"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                บันทึกการตั้งค่า
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function SecuritySettingsPanel() {
  const [settings, setSettings] = useState<SecuritySettings>({
    passwordMinLength: 6,
    passwordRequireUppercase: false,
    passwordRequireNumbers: true,
    passwordRequireSymbols: false,
    lockoutAttempts: 5,
    lockoutDuration: 300,
    sessionTimeout: 3600,
    enableTwoFactor: false,
    ipWhitelist: []
  });
  const [newIp, setNewIp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const addIpToWhitelist = () => {
    if (newIp && !settings.ipWhitelist.includes(newIp)) {
      setSettings(prev => ({
        ...prev,
        ipWhitelist: [...prev.ipWhitelist, newIp]
      }));
      setNewIp('');
    }
  };

  const removeIpFromWhitelist = (ip: string) => {
    setSettings(prev => ({
      ...prev,
      ipWhitelist: prev.ipWhitelist.filter(item => item !== ip)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        await Swal.fire({
          title: 'บันทึกสำเร็จ!',
          text: 'อัปเดตการตั้งค่าความปลอดภัยเรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        throw new Error(data.error || 'การอัปเดตล้มเหลว');
      }
    } catch (error) {
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: error instanceof Error ? error.message : 'ไม่สามารถอัปเดตการตั้งค่าได้',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-soft rounded-lg p-6">
      <div className="flex items-center mb-6">
        <Shield className="h-6 w-6 text-red-600 mr-3" />
        <h3 className="text-lg font-medium text-gray-900">การตั้งค่าความปลอดภัย</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Password Policy */}
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-4">นโยบายรหัสผ่าน</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
            <div>
              <label className="form-label">ความยาวรหัสผ่านขั้นต่ำ</label>
              <input
                type="number"
                name="passwordMinLength"
                value={settings.passwordMinLength}
                onChange={handleInputChange}
                className="form-input"
                min="4"
                max="128"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="passwordRequireUppercase"
                checked={settings.passwordRequireUppercase}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">ต้องมีตัวอักษรพิมพ์ใหญ่</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="passwordRequireNumbers"
                checked={settings.passwordRequireNumbers}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">ต้องมีตัวเลข</span>
            </label>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                name="passwordRequireSymbols"
                checked={settings.passwordRequireSymbols}
                onChange={handleInputChange}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className="ml-2 text-sm text-gray-700">ต้องมีสัญลักษณ์พิเศษ</span>
            </label>
          </div>
        </div>

        {/* Account Lockout */}
        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">การล็อคบัญชี</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">จำนวนครั้งที่ล็อกอินผิดให้ล็อค</label>
              <input
                type="number"
                name="lockoutAttempts"
                value={settings.lockoutAttempts}
                onChange={handleInputChange}
                className="form-input"
                min="3"
                max="10"
              />
            </div>

            <div>
              <label className="form-label">ระยะเวลาล็อค (วินาที)</label>
              <input
                type="number"
                name="lockoutDuration"
                value={settings.lockoutDuration}
                onChange={handleInputChange}
                className="form-input"
                min="60"
                max="3600"
              />
            </div>
          </div>
        </div>

        {/* IP Whitelist */}
        <div className="border-t pt-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">รายการ IP ที่อนุญาต</h4>
          
          <div className="mb-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="เพิ่ม IP Address (เช่น 192.168.1.0/24)"
                className="form-input flex-1"
              />
              <button
                type="button"
                onClick={addIpToWhitelist}
                className="btn-primary"
              >
                เพิ่ม
              </button>
            </div>
          </div>

          {settings.ipWhitelist.length > 0 && (
            <div className="space-y-2">
              {settings.ipWhitelist.map((ip, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">{ip}</span>
                  <button
                    type="button"
                    onClick={() => removeIpFromWhitelist(ip)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Two-Factor Authentication */}
        <div className="border-t pt-6">
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              name="enableTwoFactor"
              checked={settings.enableTwoFactor}
              onChange={handleInputChange}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">เปิดใช้งานการยืนยันตัวตนสองขั้นตอน (2FA)</span>
          </label>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                บันทึกการตั้งค่า
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function SystemInfoPanel() {
  const [systemInfo, setSystemInfo] = useState({
    version: '1.0.0',
    uptime: '5 days, 12 hours',
    totalUsers: 12,
    totalServers: 25,
    totalConnections: 45,
    memoryUsage: 65,
    diskUsage: 42,
    cpuUsage: 23,
    lastBackup: '2024-01-15 14:30:00',
    databaseSize: '156 MB'
  });

  const exportSystemLogs = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/system/export-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-logs-${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        Swal.fire({
          title: 'ส่งออกสำเร็จ!',
          text: 'ดาวน์โหลดไฟล์ log เรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      }
    } catch (error) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถส่งออกไฟล์ log ได้',
        icon: 'error'
      });
    }
  };

  const createBackup = async () => {
    const result = await Swal.fire({
      title: 'สร้าง Backup',
      text: 'คุณต้องการสร้าง backup ระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'สร้าง Backup',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/system/backup', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data: ApiResponse = await response.json();

        if (data.success) {
          Swal.fire({
            title: 'สร้าง Backup สำเร็จ!',
            text: 'ระบบได้สร้าง backup เรียบร้อยแล้ว',
            icon: 'success'
          });
        } else {
          throw new Error(data.error || 'การสร้าง backup ล้มเหลว');
        }
      } catch (error) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: error instanceof Error ? error.message : 'ไม่สามารถสร้าง backup ได้',
          icon: 'error'
        });
      }
    }
  };

  return (
    <div className="bg-white shadow-soft rounded-lg p-6">
      <div className="flex items-center mb-6">
        <Database className="h-6 w-6 text-green-600 mr-3" />
        <h3 className="text-lg font-medium text-gray-900">ข้อมูลระบบ</h3>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <Activity className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <h4 className="text-lg font-semibold text-gray-900">{systemInfo.totalUsers}</h4>
          <p className="text-sm text-gray-500">ผู้ใช้งานทั้งหมด</p>
        </div>

        <div className="text-center p-4 bg-green-50 rounded-lg">
          <Server className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <h4 className="text-lg font-semibold text-gray-900">{systemInfo.totalServers}</h4>
          <p className="text-sm text-gray-500">เซิร์ฟเวอร์ทั้งหมด</p>
        </div>

        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <Globe className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <h4 className="text-lg font-semibold text-gray-900">{systemInfo.totalConnections}</h4>
          <p className="text-sm text-gray-500">การเชื่อมต่อทั้งหมด</p>
        </div>
      </div>

      {/* Resource Usage */}
      <div className="mb-6">
        <h4 className="text-md font-medium text-gray-900 mb-4">การใช้งานทรัพยากร</h4>
        
        <div className="space-y-4">
          {/* CPU Usage */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">CPU</span>
              <span className="text-sm text-gray-900">{systemInfo.cpuUsage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${systemInfo.cpuUsage}%` }}
              />
            </div>
          </div>

          {/* Memory Usage */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">หน่วยความจำ</span>
              <span className="text-sm text-gray-900">{systemInfo.memoryUsage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${systemInfo.memoryUsage}%` }}
              />
            </div>
          </div>

          {/* Disk Usage */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600">พื้นที่เก็บข้อมูล</span>
              <span className="text-sm text-gray-900">{systemInfo.diskUsage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${systemInfo.diskUsage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">เวอร์ชัน:</span>
            <span className="ml-2 font-medium">v{systemInfo.version}</span>
          </div>
          <div>
            <span className="text-gray-500">เวลาทำงาน:</span>
            <span className="ml-2 font-medium">{systemInfo.uptime}</span>
          </div>
          <div>
            <span className="text-gray-500">ขนาดฐานข้อมูล:</span>
            <span className="ml-2 font-medium">{systemInfo.databaseSize}</span>
          </div>
          <div>
            <span className="text-gray-500">Backup ล่าสุด:</span>
            <span className="ml-2 font-medium">{systemInfo.lastBackup}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={exportSystemLogs}
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Download className="h-4 w-4 mr-2" />
          ส่งออก Logs
        </button>

        <button
          onClick={createBackup}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <HardDrive className="h-4 w-4 mr-2" />
          สร้าง Backup
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  useEffect(() => {
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        setCurrentUser(JSON.parse(userInfo));
      } catch (error) {
        console.error('Error parsing user info:', error);
      }
    }
  }, []);

  const tabs = [
    { id: 'profile', name: 'โปรไฟล์', icon: User },
    { id: 'system', name: 'ระบบ', icon: Settings, adminOnly: true },
    { id: 'security', name: 'ความปลอดภัย', icon: Shield, adminOnly: true },
    { id: 'info', name: 'ข้อมูลระบบ', icon: Database, adminOnly: true }
  ].filter(tab => !tab.adminOnly || currentUser?.role === 'ADMIN');

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">การตั้งค่า</h1>
          <p className="mt-1 text-sm text-gray-500">
            จัดการการตั้งค่าโปรไฟล์และระบบ
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
                  >
                    <Icon className="h-5 w-5 mr-2" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'system' && <SystemSettingsPanel />}
          {activeTab === 'security' && <SecuritySettingsPanel />}
          {activeTab === 'info' && <SystemInfoPanel />}
        </div>
      </div>
    </Layout>
  );
}