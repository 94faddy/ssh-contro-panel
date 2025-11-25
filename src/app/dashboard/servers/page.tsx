'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Filter, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';
import Layout from '@/components/Layout';
import ServerCard from '@/components/ServerCard';
import ServerModal from '@/components/ServerModal';
import { debounce } from '@/lib/utils';
import type { Server, ServerFilter, ApiResponse, PaginatedResponse } from '@/types';

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [filter, setFilter] = useState<ServerFilter>({
    search: '',
    status: undefined,
    sortBy: 'name',
    sortOrder: 'asc',
    page: 1,
    limit: 12
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    fetchServers();
  }, [filter]);

  const fetchServers = async () => {
    if (filter.page === 1) {
      setLoading(true);
    }

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const params = new URLSearchParams();
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, String(value));
        }
      });

      const response = await fetch(`/api/servers?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: PaginatedResponse<Server> = await response.json();
        if (data.success) {
          setServers(data.data || []);
          setPagination(data.pagination);
        }
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถโหลดข้อมูลเซิร์ฟเวอร์ได้',
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshServers = async () => {
    setRefreshing(true);
    await fetchServers();
    setRefreshing(false);
  };

  const debouncedSearch = debounce((searchTerm: string) => {
    setFilter(prev => ({ ...prev, search: searchTerm, page: 1 }));
  }, 500);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debouncedSearch(e.target.value);
  };

  const handleFilterChange = (key: keyof ServerFilter, value: any) => {
    setFilter(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setShowModal(true);
  };

  const handleDelete = async (serverId: number) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: 'คุณต้องการลบเซิร์ฟเวอร์นี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้',
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
        const response = await fetch(`/api/servers/${serverId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          await Swal.fire({
            title: 'ลบสำเร็จ',
            text: 'ลบเซิร์ฟเวอร์เรียบร้อยแล้ว',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
          });
          fetchServers();
        } else {
          const data = await response.json();
          throw new Error(data.error || 'ไม่สามารถลบเซิร์ฟเวอร์ได้');
        }
      } catch (error) {
        Swal.fire({
          title: 'เกิดข้อผิดพลาด',
          text: error instanceof Error ? error.message : 'ไม่สามารถลบเซิร์ฟเวอร์ได้',
          icon: 'error'
        });
      }
    }
  };

  const handleConnect = async (serverId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/ssh/status/${serverId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await Swal.fire({
          title: 'เชื่อมต่อสำเร็จ',
          text: 'เชื่อมต่อกับเซิร์ฟเวอร์เรียบร้อยแล้ว',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
        fetchServers();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'ไม่สามารถเชื่อมต่อได้');
      }
    } catch (error) {
      Swal.fire({
        title: 'การเชื่อมต่อล้มเหลว',
        text: error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
        icon: 'error'
      });
    }
  };

  const handleTerminal = (serverId: number) => {
    // Navigate to terminal page with server ID
    window.open(`/dashboard/terminal?server=${serverId}`, '_blank');
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingServer(null);
  };

  const handleServerSaved = () => {
    handleModalClose();
    fetchServers();
  };

  const handlePageChange = (newPage: number) => {
    setFilter(prev => ({ ...prev, page: newPage }));
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">จัดการเซิร์ฟเวอร์</h1>
              <p className="mt-1 text-sm text-gray-500">
                เพิ่ม แก้ไข และจัดการเซิร์ฟเวอร์ Ubuntu ของคุณ
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={refreshServers}
                disabled={refreshing}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                รีเฟรช
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                เพิ่มเซิร์ฟเวอร์
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white shadow-sm rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาเซิร์ฟเวอร์..."
                className="pl-10 form-input"
                onChange={handleSearchChange}
              />
            </div>

            {/* Status Filter */}
            <select
              value={filter.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              className="form-input"
            >
              <option value="">สถานะทั้งหมด</option>
              <option value="CONNECTED">เชื่อมต่อแล้ว</option>
              <option value="DISCONNECTED">ไม่ได้เชื่อมต่อ</option>
              <option value="ERROR">ข้อผิดพลาด</option>
            </select>

            {/* Sort By */}
            <select
              value={filter.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="form-input"
            >
              <option value="name">เรียงตามชื่อ</option>
              <option value="host">เรียงตาม IP</option>
              <option value="status">เรียงตามสถานะ</option>
              <option value="lastChecked">เรียงตามการตรวจสอบ</option>
            </select>

            {/* Sort Order */}
            <select
              value={filter.sortOrder}
              onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
              className="form-input"
            >
              <option value="asc">น้อยไปมาก</option>
              <option value="desc">มากไปน้อย</option>
            </select>
          </div>
        </div>

        {/* Servers Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white shadow-soft rounded-lg p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">ไม่มีเซิร์ฟเวอร์</h3>
            <p className="text-gray-500 mb-6">
              เริ่มต้นด้วยการเพิ่มเซิร์ฟเวอร์ Ubuntu แรกของคุณ
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              เพิ่มเซิร์ฟเวอร์
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onConnect={handleConnect}
                  onTerminal={handleTerminal}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      แสดง <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> ถึง{' '}
                      <span className="font-medium">
                        {Math.min(pagination.page * pagination.limit, pagination.total)}
                      </span>{' '}
                      จาก <span className="font-medium">{pagination.total}</span> รายการ
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                      >
                        ก่อนหน้า
                      </button>
                      {[...Array(pagination.totalPages)].map((_, i) => {
                        const page = i + 1;
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                              page === pagination.page
                                ? 'bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                      >
                        ถัดไป
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Server Modal */}
        {showModal && (
          <ServerModal
            server={editingServer}
            onClose={handleModalClose}
            onSaved={handleServerSaved}
          />
        )}
      </div>
    </Layout>
  );
}