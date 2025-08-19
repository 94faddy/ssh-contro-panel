'use client';

import { useState, useEffect } from 'react';
import { 
  Server, 
  Terminal, 
  FileText, 
  Activity, 
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Loader
} from 'lucide-react';
import Layout from '@/components/Layout';
import { formatRelativeTime, formatUptime, formatBytes } from '@/lib/utils';
import type { DashboardStats, ServerStatsData, ScriptLog, ApiResponse } from '@/types';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: string;
  loading?: boolean;
}

function StatsCard({ title, value, icon: Icon, color, trend, loading }: StatsCardProps) {
  return (
    <div className="bg-white overflow-hidden shadow-soft rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`p-3 rounded-md ${color}`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd className="flex items-baseline">
                {loading ? (
                  <div className="animate-pulse h-8 bg-gray-200 rounded w-16"></div>
                ) : (
                  <div className="text-2xl font-semibold text-gray-900">
                    {value}
                  </div>
                )}
                {trend && (
                  <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    {trend}
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RecentActivityProps {
  logs: ScriptLog[];
  loading: boolean;
}

function RecentActivity({ logs, loading }: RecentActivityProps) {
  return (
    <div className="bg-white shadow-soft rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          กิจกรรมล่าสุด
        </h3>
        
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex space-x-4">
                <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {logs.length === 0 ? (
                <li className="py-8 text-center text-gray-500">
                  ไม่มีกิจกรรมล่าสุด
                </li>
              ) : (
                logs.map((log, logIdx) => (
                  <li key={log.id} className={logIdx !== logs.length - 1 ? 'pb-8' : ''}>
                    <div className="relative">
                      {logIdx !== logs.length - 1 && (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                            log.status === 'SUCCESS' ? 'bg-green-500' :
                            log.status === 'FAILED' ? 'bg-red-500' :
                            log.status === 'RUNNING' ? 'bg-blue-500' :
                            'bg-gray-500'
                          }`}>
                            {log.status === 'SUCCESS' && <CheckCircle className="h-5 w-5 text-white" />}
                            {log.status === 'FAILED' && <XCircle className="h-5 w-5 text-white" />}
                            {log.status === 'RUNNING' && <Loader className="h-5 w-5 text-white animate-spin" />}
                            {log.status === 'CANCELLED' && <XCircle className="h-5 w-5 text-white" />}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-900">
                                {log.scriptName}
                              </span>
                              {log.server && (
                                <span className="text-gray-500 ml-2">
                                  บน {log.server.name}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-sm text-gray-500">
                              {formatRelativeTime(log.startTime)}
                            </p>
                          </div>
                          <div className="mt-2 text-sm text-gray-700">
                            <p className="truncate">{log.command}</p>
                            {log.duration && (
                              <p className="text-xs text-gray-500 mt-1">
                                ใช้เวลา {log.duration} วินาที
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface ServerOverviewProps {
  servers: ServerStatsData[];
  loading: boolean;
}

function ServerOverview({ servers, loading }: ServerOverviewProps) {
  return (
    <div className="bg-white shadow-soft rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          ภาพรวมเซิร์ฟเวอร์
        </h3>
        
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-2 bg-gray-200 rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {servers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                ไม่มีเซิร์ฟเวอร์
              </p>
            ) : (
              servers.slice(0, 5).map((server) => (
                <div key={server.serverId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900">
                      {server.serverName}
                    </h4>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      server.status === 'CONNECTED' ? 'bg-green-100 text-green-800' :
                      server.status === 'DISCONNECTED' ? 'bg-gray-100 text-gray-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {server.status === 'CONNECTED' ? 'เชื่อมต่อ' :
                       server.status === 'DISCONNECTED' ? 'ไม่เชื่อมต่อ' :
                       'ข้อผิดพลาด'}
                    </span>
                  </div>
                  
                  {server.status === 'CONNECTED' && (
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {server.cpuUsage !== undefined && (
                        <div>
                          <span className="text-gray-500">CPU:</span>
                          <div className="mt-1">
                            <div className="flex items-center">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${server.cpuUsage}%` }}
                                ></div>
                              </div>
                              <span className="ml-2 text-xs">{server.cpuUsage.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {server.memoryUsage !== undefined && (
                        <div>
                          <span className="text-gray-500">Memory:</span>
                          <div className="mt-1">
                            <div className="flex items-center">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{ width: `${server.memoryUsage}%` }}
                                ></div>
                              </div>
                              <span className="ml-2 text-xs">{server.memoryUsage.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {server.uptime !== undefined && (
                        <div>
                          <span className="text-gray-500">Uptime:</span>
                          <div className="mt-1 text-xs">
                            {formatUptime(server.uptime)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {server.lastChecked && (
                    <p className="text-xs text-gray-500 mt-2">
                      ตรวจสอบล่าสุด: {formatRelativeTime(server.lastChecked)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [servers, setServers] = useState<ServerStatsData[]>([]);
  const [recentLogs, setRecentLogs] = useState<ScriptLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      // Fetch stats, servers, and recent logs in parallel
      const [statsResponse, serversResponse, logsResponse] = await Promise.all([
        fetch('/api/dashboard/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/servers?limit=10', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/scripts/logs?limit=10', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      // Process stats
      if (statsResponse.ok) {
        const statsData: ApiResponse<DashboardStats> = await statsResponse.json();
        if (statsData.success) {
          setStats(statsData.data!);
        }
      }

      // Process servers - แก้ไขการคำนวณ Memory Usage
      if (serversResponse.ok) {
        const serversData = await serversResponse.json();
        if (serversData.success) {
          const serverStats: ServerStatsData[] = serversData.data.map((server: any) => {
            // แก้ไขการคำนวณ Memory Usage ให้ถูกต้อง
            let memoryUsage = undefined;
            if (server.systemInfo?.totalMemory && server.systemInfo?.freeMemory) {
              memoryUsage = ((server.systemInfo.totalMemory - server.systemInfo.freeMemory) / server.systemInfo.totalMemory) * 100;
            }

            return {
              serverId: server.id,
              serverName: server.name,
              status: server.status,
              cpuUsage: server.systemInfo?.loadAverage?.[0] ? 
                Math.min((server.systemInfo.loadAverage[0] / (server.systemInfo.cpuCount || 1)) * 100, 100) : undefined,
              memoryUsage,
              uptime: server.systemInfo?.uptime,
              lastChecked: server.lastChecked
            };
          });
          setServers(serverStats);
        }
      }

      // Process logs
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        if (logsData.success) {
          setRecentLogs(logsData.data);
        }
      }

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate derived stats
  const derivedStats = stats ? {
    totalServers: stats.totalServers,
    connectedServers: stats.connectedServers,
    disconnectedServers: stats.disconnectedServers,
    runningScripts: stats.runningScripts,
    successRate: stats.successRate
  } : null;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">แดชบอร์ด</h1>
          <p className="mt-1 text-sm text-gray-500">
            ภาพรวมการจัดการเซิร์ฟเวอร์และสถานะระบบ
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatsCard
            title="เซิร์ฟเวอร์ทั้งหมด"
            value={derivedStats?.totalServers || 0}
            icon={Server}
            color="bg-blue-500"
            loading={loading}
          />
          <StatsCard
            title="เซิร์ฟเวอร์ออนไลน์"
            value={derivedStats?.connectedServers || 0}
            icon={CheckCircle}
            color="bg-green-500"
            loading={loading}
          />
          <StatsCard
            title="Scripts ที่กำลังทำงาน"
            value={derivedStats?.runningScripts || 0}
            icon={Activity}
            color="bg-yellow-500"
            loading={loading}
          />
          <StatsCard
            title="อัตราความสำเร็จ"
            value={derivedStats ? `${derivedStats.successRate.toFixed(1)}%` : '0%'}
            icon={TrendingUp}
            color="bg-purple-500"
            loading={loading}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Server Overview - Takes 2 columns on large screens */}
          <div className="lg:col-span-2">
            <ServerOverview servers={servers} loading={loading} />
          </div>

          {/* Recent Activity - Takes 1 column */}
          <div className="lg:col-span-1">
            <RecentActivity logs={recentLogs} loading={loading} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-white shadow-soft rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">การดำเนินการด่วน</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/dashboard/servers"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150"
            >
              <Plus className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-gray-900">เพิ่มเซิร์ฟเวอร์</h4>
                <p className="text-xs text-gray-500">เพิ่มเซิร์ฟเวอร์ใหม่</p>
              </div>
            </a>
            
            <a
              href="/dashboard/terminal"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150"
            >
              <Terminal className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-gray-900">เปิดเทอร์มินัล</h4>
                <p className="text-xs text-gray-500">เชื่อมต่อเซิร์ฟเวอร์</p>
              </div>
            </a>
            
            <a
              href="/dashboard/scripts"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150"
            >
              <Activity className="h-8 w-8 text-purple-600 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-gray-900">รัน Script</h4>
                <p className="text-xs text-gray-500">ประมวลผลหลายเซิร์ฟเวอร์</p>
              </div>
            </a>
            
            <a
              href="/dashboard/logs"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150"
            >
              <FileText className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-gray-900">ดูบันทึก</h4>
                <p className="text-xs text-gray-500">ตรวจสอบกิจกรรม</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </Layout>
  );
}