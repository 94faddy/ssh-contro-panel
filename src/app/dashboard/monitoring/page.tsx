'use client';

import { useState, useEffect } from 'react';
import { 
  Activity, 
  Server, 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Wifi, 
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import Layout from '@/components/Layout';
import { formatBytes, formatUptime, formatRelativeTime } from '@/lib/utils';
import type { Server as ServerType, SystemInfo, ApiResponse } from '@/types';

interface ServerMonitorData extends ServerType {
  systemInfo?: SystemInfo;
  metrics?: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkIn: number;
    networkOut: number;
  };
  alerts?: Alert[];
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  resolved: boolean;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  percentage?: number;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
  icon: React.ComponentType<{ className?: string }>;
}

function MetricCard({ title, value, unit, percentage, trend, status, icon: Icon }: MetricCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-blue-600 bg-blue-100';
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-green-500" />;
      default: return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-soft p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className={`p-3 rounded-lg ${getStatusColor()}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="ml-4">
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            <div className="flex items-center mt-1">
              <span className="text-2xl font-bold text-gray-900">
                {value}
              </span>
              {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
              {getTrendIcon()}
            </div>
          </div>
        </div>
      </div>
      
      {percentage !== undefined && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>การใช้งาน</span>
            <span>{percentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                percentage > 90 ? 'bg-red-500' :
                percentage > 75 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ServerMonitorCardProps {
  server: ServerMonitorData;
  onRefresh: (serverId: number) => void;
  refreshing: boolean;
}

function ServerMonitorCard({ server, onRefresh, refreshing }: ServerMonitorCardProps) {
  const systemInfo = server.systemInfo;

  const getStatusIcon = () => {
    switch (server.status) {
      case 'CONNECTED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'DISCONNECTED':
        return <XCircle className="h-5 w-5 text-gray-600" />;
      case 'ERROR':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <Wifi className="h-5 w-5 text-yellow-600" />;
    }
  };

  // แก้ไขการคำนวณ Memory Usage ให้ถูกต้อง
  const memoryUsage = systemInfo && systemInfo.totalMemory > 0 ? 
    ((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100 : 0;

  const primaryDisk = systemInfo?.diskUsage?.[0];
  const diskUsage = primaryDisk ? 
    parseFloat(primaryDisk.usePercent.replace('%', '')) : 0;

  const cpuLoad = systemInfo?.loadAverage?.[0] || 0;
  const cpuUsage = Math.min((cpuLoad / (systemInfo?.cpuCount || 1)) * 100, 100);

  return (
    <div className="bg-white rounded-lg shadow-soft overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">{server.name}</h3>
              <p className="text-sm text-gray-500">{server.host}:{server.port}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onRefresh(server.id)}
              disabled={refreshing}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors duration-150"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                server.status === 'CONNECTED' ? 'bg-green-100 text-green-800' :
                server.status === 'DISCONNECTED' ? 'bg-gray-100 text-gray-800' :
                'bg-red-100 text-red-800'
              }`}>
                {server.status === 'CONNECTED' ? 'เชื่อมต่อแล้ว' :
                 server.status === 'DISCONNECTED' ? 'ไม่ได้เชื่อมต่อ' :
                 'ข้อผิดพลาด'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      {server.status === 'CONNECTED' && systemInfo && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* CPU Usage */}
            <MetricCard
              title="CPU"
              value={cpuUsage.toFixed(1)}
              unit="%"
              percentage={cpuUsage}
              status={cpuUsage > 90 ? 'critical' : cpuUsage > 75 ? 'warning' : 'good'}
              icon={Cpu}
              trend={cpuUsage > 80 ? 'up' : 'stable'}
            />

            {/* Memory Usage - แก้ไขการแสดงผล */}
            <MetricCard
              title="หน่วยความจำ"
              value={formatBytes(systemInfo.totalMemory - systemInfo.freeMemory)}
              percentage={memoryUsage}
              status={memoryUsage > 90 ? 'critical' : memoryUsage > 75 ? 'warning' : 'good'}
              icon={MemoryStick}
              trend={memoryUsage > 80 ? 'up' : 'stable'}
            />

            {/* Disk Usage */}
            {primaryDisk && (
              <MetricCard
                title="พื้นที่เก็บข้อมูล"
                value={primaryDisk.used}
                percentage={diskUsage}
                status={diskUsage > 90 ? 'critical' : diskUsage > 75 ? 'warning' : 'good'}
                icon={HardDrive}
                trend={diskUsage > 80 ? 'up' : 'stable'}
              />
            )}

            {/* Uptime */}
            <MetricCard
              title="เวลาทำงาน"
              value={formatUptime(systemInfo.uptime)}
              status="good"
              icon={Clock}
              trend="stable"
            />
          </div>

          {/* System Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">ข้อมูลระบบ</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">ระบบปฏิบัติการ:</span>
                <div className="font-medium">{systemInfo.os} {systemInfo.arch}</div>
              </div>
              <div>
                <span className="text-gray-500">จำนวน CPU:</span>
                <div className="font-medium">{systemInfo.cpuCount} cores</div>
              </div>
              <div>
                <span className="text-gray-500">Load Average:</span>
                <div className="font-medium">
                  {systemInfo.loadAverage.map(load => load.toFixed(2)).join(', ')}
                </div>
              </div>
              <div>
                <span className="text-gray-500">หน่วยความจำรวม:</span>
                <div className="font-medium">{formatBytes(systemInfo.totalMemory)}</div>
              </div>
              <div>
                <span className="text-gray-500">หน่วยความจำว่าง:</span>
                <div className="font-medium">{formatBytes(systemInfo.freeMemory)}</div>
              </div>
              <div>
                <span className="text-gray-500">ตรวจสอบล่าสุด:</span>
                <div className="font-medium">
                  {server.lastChecked ? formatRelativeTime(server.lastChecked) : 'ไม่มีข้อมูล'}
                </div>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {server.alerts && server.alerts.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-900 mb-3">การแจ้งเตือน</h4>
              <div className="space-y-2">
                {server.alerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-md border-l-4 ${
                      alert.type === 'error' ? 'bg-red-50 border-red-400 text-red-700' :
                      alert.type === 'warning' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' :
                      'bg-blue-50 border-blue-400 text-blue-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(alert.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disconnected State */}
      {server.status !== 'CONNECTED' && (
        <div className="p-6 text-center">
          <div className="text-gray-500 mb-4">
            <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้</p>
            <p className="text-sm">กรุณาตรวจสอบการเชื่อมต่อ</p>
          </div>
          <button
            onClick={() => onRefresh(server.id)}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                กำลังตรวจสอบ...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                ลองเชื่อมต่อใหม่
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MonitoringPage() {
  const [servers, setServers] = useState<ServerMonitorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<number[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchServers();
    
    // Auto refresh every 30 seconds
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchServers, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchServers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('/api/servers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data: ApiResponse<ServerMonitorData[]> = await response.json();
        if (data.success) {
          // Generate mock alerts for demo
          const serversWithAlerts = data.data!.map(server => ({
            ...server,
            alerts: server.status === 'CONNECTED' && Math.random() > 0.7 ? [{
              id: `alert-${server.id}`,
              type: Math.random() > 0.5 ? 'warning' : 'error' as const,
              message: Math.random() > 0.5 ? 
                'การใช้งาน CPU สูงกว่าปกติ' : 
                'พื้นที่เก็บข้อมูลเหลือน้อย',
              timestamp: new Date().toISOString(),
              resolved: false
            }] : []
          }));
          
          setServers(serversWithAlerts);
        }
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshServer = async (serverId: number) => {
    setRefreshing(prev => [...prev, serverId]);
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/servers/${serverId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        // Refresh all servers to get updated data
        await fetchServers();
      }
    } catch (error) {
      console.error('Failed to refresh server:', error);
    } finally {
      setRefreshing(prev => prev.filter(id => id !== serverId));
    }
  };

  // Calculate summary stats - แก้ไขการคำนวณ Average CPU
  const connectedServers = servers.filter(s => s.status === 'CONNECTED').length;
  const totalServers = servers.length;
  const connectedServersWithSystemInfo = servers.filter(s => s.status === 'CONNECTED' && s.systemInfo?.loadAverage);
  
  const avgCpuUsage = connectedServersWithSystemInfo.length > 0 ?
    connectedServersWithSystemInfo.reduce((acc, s) => {
      const cpuLoad = s.systemInfo!.loadAverage[0];
      const cpuCount = s.systemInfo!.cpuCount || 1;
      return acc + Math.min((cpuLoad / cpuCount) * 100, 100);
    }, 0) / connectedServersWithSystemInfo.length : 0;

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="grid grid-cols-1 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
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
              <h1 className="text-2xl font-bold text-gray-900">ระบบติดตามสถานะ</h1>
              <p className="mt-1 text-sm text-gray-500">
                ติดตามสถานะและประสิทธิภาพของเซิร์ฟเวอร์แบบเรียลไทม์
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">รีเฟรชอัตโนมัติ</span>
              </label>
              
              <button
                onClick={fetchServers}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                รีเฟรชทั้งหมด
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-100">
                <Server className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">เซิร์ฟเวอร์ออนไลน์</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {connectedServers}/{totalServers}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-green-100">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">CPU เฉลี่ย</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {avgCpuUsage.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-yellow-100">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-900">การแจ้งเตือน</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {servers.reduce((acc, s) => acc + (s.alerts?.length || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Servers List */}
        <div className="space-y-6">
          {servers.length === 0 ? (
            <div className="text-center py-12">
              <Server className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">ไม่มีเซิร์ฟเวอร์</h3>
              <p className="text-gray-500">เพิ่มเซิร์ฟเวอร์เพื่อเริ่มติดตามสถานะ</p>
            </div>
          ) : (
            servers.map((server) => (
              <ServerMonitorCard
                key={server.id}
                server={server}
                onRefresh={handleRefreshServer}
                refreshing={refreshing.includes(server.id)}
              />
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}