'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Shield, 
  User, 
  Mail, 
  Calendar,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  EyeOff,
  X
} from 'lucide-react';
import Layout from '@/components/Layout';
import { formatRelativeTime, validateEmail } from '@/lib/utils';
import Swal from 'sweetalert2';
import type { User as UserType, ApiResponse } from '@/types';

interface UserModalProps {
  user?: UserType | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'DEVELOPER';
  isActive: boolean;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

function UserModal({ user, onClose, onSaved }: UserModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    role: 'DEVELOPER',
    isActive: true
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isEditing = !!user;

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        password: '', // Don't prefill password for security
        role: user.role,
        isActive: user.isActive
      });
    }
  }, [user]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'กรุณากรอกชื่อผู้ใช้งาน';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'กรุณากรอกอีเมล';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    }

    if (!isEditing && !formData.password.trim()) {
      newErrors.password = 'กรุณากรอกรหัสผ่าน';
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));

    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
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
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive,
        ...(formData.password && { password: formData.password })
      } : {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role
      };

      const response = await fetch(
        isEditing ? `/api/users/${user!.id}` : '/api/users',
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
          title: isEditing ? 'แก้ไขสำเร็จ!' : 'เพิ่มผู้ใช้งานสำเร็จ!',
          text: isEditing ? 'แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว' : 'เพิ่มผู้ใช้งานใหม่เรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
        onSaved();
      } else {
        await Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: data.error || `ไม่สามารถ${isEditing ? 'แก้ไข' : 'เพิ่ม'}ผู้ใช้งานได้`,
          icon: 'error'
        });
      }
    } catch (error) {
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: `ไม่สามารถ${isEditing ? 'แก้ไข' : 'เพิ่ม'}ผู้ใช้งานได้`,
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
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              {isEditing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
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
            {/* Name */}
            <div>
              <label htmlFor="name" className="form-label">
                ชื่อผู้ใช้งาน *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`form-input ${errors.name ? 'border-red-500' : ''}`}
                placeholder="เช่น John Doe"
                disabled={isLoading}
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="form-label">
                อีเมล *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`form-input ${errors.email ? 'border-red-500' : ''}`}
                placeholder="เช่น john@example.com"
                disabled={isLoading}
              />
              {errors.email && <p className="form-error">{errors.email}</p>}
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
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password}</p>}
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="form-label">
                สิทธิการใช้งาน *
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="form-input"
                disabled={isLoading}
              >
                <option value="DEVELOPER">นักพัฒนา (Developer)</option>
                <option value="ADMIN">ผู้ดูแลระบบ (Admin)</option>
              </select>
            </div>

            {/* Active Status (only for editing) */}
            {isEditing && (
              <div>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    disabled={isLoading}
                  />
                  <span className="ml-2 text-sm text-gray-700">บัญชีใช้งานได้</span>
                </label>
              </div>
            )}
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
              <>{isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface UserCardProps {
  user: UserType;
  onEdit: (user: UserType) => void;
  onDelete: (userId: number) => void;
  currentUserId: number;
}

function UserCard({ user, onEdit, onDelete, currentUserId }: UserCardProps) {
  const isCurrentUser = user.id === currentUserId;

  return (
    <div className="bg-white shadow-soft rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Avatar */}
          <div className="h-12 w-12 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center">
            <span className="text-lg font-medium text-white">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          
          {/* User Info */}
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-medium text-gray-900">{user.name}</h3>
              {isCurrentUser && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  คุณ
                </span>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
              }`}>
                {user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'นักพัฒนา'}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {user.isActive ? 'ใช้งานได้' : 'ปิดใช้งาน'}
              </span>
            </div>
            <p className="text-sm text-gray-500 flex items-center mt-1">
              <Mail className="h-4 w-4 mr-1" />
              {user.email}
            </p>
            <p className="text-xs text-gray-400 flex items-center mt-1">
              <Calendar className="h-4 w-4 mr-1" />
              สร้างเมื่อ {formatRelativeTime(user.createdAt)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onEdit(user)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"
          >
            <Edit className="h-4 w-4 mr-1" />
            แก้ไข
          </button>
          
          {!isCurrentUser && (
            <button
              onClick={() => onDelete(user.id)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              ลบ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'DEVELOPER'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  useEffect(() => {
    fetchUsers();
    getCurrentUser();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter, statusFilter]);

  const getCurrentUser = () => {
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        setCurrentUser(JSON.parse(userInfo));
      } catch (error) {
        console.error('Error parsing user info:', error);
      }
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data: ApiResponse<UserType[]> = await response.json();
        if (data.success) {
          setUsers(data.data!);
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Role filter
    if (roleFilter !== 'ALL') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    // Status filter
    if (statusFilter === 'ACTIVE') {
      filtered = filtered.filter(user => user.isActive);
    } else if (statusFilter === 'INACTIVE') {
      filtered = filtered.filter(user => !user.isActive);
    }

    setFilteredUsers(filtered);
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const handleEditUser = (user: UserType) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const handleDeleteUser = async (userId: number) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: 'คุณต้องการลบผู้ใช้งานนี้หรือไม่?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/users/${userId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data: ApiResponse = await response.json();

        if (data.success) {
          await Swal.fire({
            title: 'ลบสำเร็จ!',
            text: 'ลบผู้ใช้งานเรียบร้อยแล้ว',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
          });
          fetchUsers();
        } else {
          await Swal.fire({
            title: 'เกิดข้อผิดพลาด',
            text: data.error || 'ไม่สามารถลบผู้ใช้งานได้',
            icon: 'error'
          });
        }
      } catch (error) {
        await Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: 'ไม่สามารถลบผู้ใช้งานได้',
          icon: 'error'
        });
      }
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingUser(null);
  };

  const handleModalSaved = () => {
    setShowModal(false);
    setEditingUser(null);
    fetchUsers();
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="grid grid-cols-1 gap-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้งาน</h1>
              <p className="mt-1 text-sm text-gray-500">
                จัดการบัญชีผู้ใช้งานและสิทธิการเข้าถึงระบบ
              </p>
            </div>
            
            <button
              onClick={handleAddUser}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              เพิ่มผู้ใช้งาน
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white shadow-soft rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อหรืออีเมล..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">สิทธิทั้งหมด</option>
              <option value="ADMIN">ผู้ดูแลระบบ</option>
              <option value="DEVELOPER">นักพัฒนา</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">สถานะทั้งหมด</option>
              <option value="ACTIVE">ใช้งานได้</option>
              <option value="INACTIVE">ปิดใช้งาน</option>
            </select>

            {/* Results Count */}
            <div className="flex items-center text-sm text-gray-500">
              แสดง {filteredUsers.length} จาก {users.length} รายการ
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="space-y-4">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {users.length === 0 ? 'ไม่มีผู้ใช้งาน' : 'ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข'}
              </h3>
              <p className="text-gray-500">
                {users.length === 0 ? 'เพิ่มผู้ใช้งานเพื่อเริ่มจัดการระบบ' : 'ลองเปลี่ยนเงื่อนไขการค้นหา'}
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onEdit={handleEditUser}
                onDelete={handleDeleteUser}
                currentUserId={currentUser?.id || 0}
              />
            ))
          )}
        </div>

        {/* Statistics */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">ผู้ใช้งานทั้งหมด</h3>
                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-purple-100">
                <Shield className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">ผู้ดูแลระบบ</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter(u => u.role === 'ADMIN').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-green-100">
                <User className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">ผู้ใช้งานที่ใช้งานได้</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter(u => u.isActive).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* User Modal */}
        {showModal && (
          <UserModal
            user={editingUser}
            onClose={handleModalClose}
            onSaved={handleModalSaved}
          />
        )}
      </div>
    </Layout>
  );
}