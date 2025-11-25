'use client';

import { useState, useEffect } from 'react';
import { X, Server, TestTube } from 'lucide-react';
import Swal from 'sweetalert2';
import { validateIP, validatePort } from '@/lib/utils';
import type { Server as ServerType, CreateServerData, UpdateServerData, ApiResponse } from '@/types';

interface ServerModalProps {
  server?: ServerType | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

interface FormErrors {
  name?: string;
  host?: string;
  port?: string;
  username?: string;
  password?: string;
}

export default function ServerModal({ server, onClose, onSaved }: ServerModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isEditing = !!server;

  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        host: server.host,
        port: server.port,
        username: server.username,
        password: '' // Don't prefill password for security
      });
    }
  }, [server]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'กรุณากรอกชื่อเซิร์ฟเวอร์';
    }

    if (!formData.host.trim()) {
      newErrors.host = 'กรุณากรอก IP Address หรือ hostname';
    } else if (!validateIP(formData.host) && !formData.host.includes('.')) {
      newErrors.host = 'รูปแบบ IP Address หรือ hostname ไม่ถูกต้อง';
    }

    if (!validatePort(formData.port)) {
      newErrors.port = 'Port ต้องอยู่ระหว่าง 1-65535';
    }

    if (!formData.username.trim()) {
      newErrors.username = 'กรุณากรอกชื่อผู้ใช้งาน';
    }

    if (!isEditing && !formData.password.trim()) {
      newErrors.password = 'กรุณากรอกรหัสผ่าน';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'port' ? parseInt(value) || 22 : value
    }));

    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const testConnection = async () => {
    if (!formData.host || !formData.username || (!isEditing && !formData.password)) {
      Swal.fire({
        title: 'ข้อมูลไม่ครบ',
        text: 'กรุณากรอกข้อมูลการเชื่อมต่อให้ครบถ้วน',
        icon: 'warning'
      });
      return;
    }

    setIsTesting(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/ssh/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: formData.host,
          port: formData.port,
          username: formData.username,
          password: formData.password
        })
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        await Swal.fire({
          title: 'การเชื่อมต่อสำเร็จ!',
          text: 'สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        await Swal.fire({
          title: 'การเชื่อมต่อล้มเหลว',
          text: data.error || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
          icon: 'error'
        });
      }
    } catch (error) {
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถทดสอบการเชื่อมต่อได้',
        icon: 'error'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      
      const requestData = isEditing ? {
        name: formData.name,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        ...(formData.password && { password: formData.password })
      } as UpdateServerData : {
        name: formData.name,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password
      } as CreateServerData;

      const response = await fetch(
        isEditing ? `/api/servers/${server!.id}` : '/api/servers',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestData)
        }
      );

      const data: ApiResponse = await response.json();

      if (data.success) {
        await Swal.fire({
          title: isEditing ? 'แก้ไขสำเร็จ!' : 'เพิ่มเซิร์ฟเวอร์สำเร็จ!',
          text: isEditing ? 'แก้ไขข้อมูลเซิร์ฟเวอร์เรียบร้อยแล้ว' : 'เพิ่มเซิร์ฟเวอร์ใหม่เรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
        onSaved();
      } else {
        await Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: data.error || `ไม่สามารถ${isEditing ? 'แก้ไข' : 'เพิ่ม'}เซิร์ฟเวอร์ได้`,
          icon: 'error'
        });
      }
    } catch (error) {
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถ${isEditing ? 'แก้ไข' : 'เพิ่ม'}เซิร์ฟเวอร์ได้`,
        icon: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg mr-3">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              {isEditing ? 'แก้ไขเซิร์ฟเวอร์' : 'เพิ่มเซิร์ฟเวอร์ใหม่'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors duration-150"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Server Name */}
            <div>
              <label htmlFor="name" className="form-label">
                ชื่อเซิร์ฟเวอร์ *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`form-input ${errors.name ? 'border-red-500' : ''}`}
                placeholder="เช่น Production Server 1"
                disabled={isLoading}
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            {/* Host */}
            <div>
              <label htmlFor="host" className="form-label">
                IP Address หรือ Hostname *
              </label>
              <input
                type="text"
                id="host"
                name="host"
                value={formData.host}
                onChange={handleInputChange}
                className={`form-input ${errors.host ? 'border-red-500' : ''}`}
                placeholder="เช่น 192.168.1.100 หรือ server.example.com"
                disabled={isLoading}
              />
              {errors.host && <p className="form-error">{errors.host}</p>}
            </div>

            {/* Port */}
            <div>
              <label htmlFor="port" className="form-label">
                SSH Port *
              </label>
              <input
                type="number"
                id="port"
                name="port"
                value={formData.port}
                onChange={handleInputChange}
                className={`form-input ${errors.port ? 'border-red-500' : ''}`}
                placeholder="22"
                min="1"
                max="65535"
                disabled={isLoading}
              />
              {errors.port && <p className="form-error">{errors.port}</p>}
            </div>

            {/* Username */}
            <div>
              <label htmlFor="username" className="form-label">
                ชื่อผู้ใช้งาน *
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className={`form-input ${errors.username ? 'border-red-500' : ''}`}
                placeholder="เช่น ubuntu, root"
                disabled={isLoading}
              />
              {errors.username && <p className="form-error">{errors.username}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="form-label">
                รหัสผ่าน {isEditing ? '(เว้นว่างหากไม่ต้องการเปลี่ยน)' : '*'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`form-input pr-10 ${errors.password ? 'border-red-500' : ''}`}
                  placeholder={isEditing ? 'เว้นว่างหากไม่ต้องการเปลี่ยน' : 'กรอกรหัสผ่าน'}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L9.88 9.88m4.242 4.242L14.12 14.12M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password}</p>}
            </div>

            {/* Test Connection Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={testConnection}
                disabled={isTesting || isLoading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isTesting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                    กำลังทดสอบ...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    ทดสอบการเชื่อมต่อ
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline"
            disabled={isLoading}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {isEditing ? 'กำลังแก้ไข...' : 'กำลังเพิ่ม...'}
              </>
            ) : (
              <>{isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มเซิร์ฟเวอร์'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}