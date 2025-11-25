'use client';

import { useState } from 'react';
import { 
  Server, 
  Terminal, 
  Edit, 
  Trash2, 
  Power, 
  Cpu, 
  HardDrive, 
  MemoryStick,
  Clock,
  Activity,
  Wifi,
  WifiOff,
  AlertCircle
} from 'lucide-react';
import { formatRelativeTime, formatUptime, formatBytes, getServerStatusColor, getServerStatusText } from '@/lib/utils';
import type { Server as ServerType, ServerCardProps, SystemInfo } from '@/types';

export default function ServerCard({ server, onEdit, onDelete, onConnect, onTerminal }: ServerCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect(server.id);
    } finally {
      setIsConnecting(false);
    }
  };

  const getStatusIcon = () => {
    switch (server.status) {
      case 'CONNECTED':
        return <Wifi className="h-5 w-5 text-green-600" />;
      case 'DISCONNECTED':
        return <WifiOff className="h-5 w-5 text-gray-600" />;
      case 'ERROR':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'CONNECTING':
        return <Activity className="h-5 w-5 text-yellow-600 animate-pulse" />;
      default:
        return <WifiOff className="h-5 w-5 text-gray-600" />;
    }
  };

  const systemInfo = server.systemInfo as SystemInfo | undefined;
  
  // แก้ไขการคำนวณ Memory Usage ให้ถูกต้อง
  const memoryUsage = systemInfo && systemInfo.totalMemory > 0 ? 
    ((systemInfo.totalMemory - systemInfo.freeMemory) / systemInfo.totalMemory) * 100 : 0;
  
  const primaryDisk = systemInfo?.diskUsage?.[0];

  return (
    <div className="bg-white shadow-soft rounded-lg overflow-hidden hover:shadow-lg transition-all duration-200">
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
          
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getServerStatusColor(server.status)}`}>
              {getServerStatusText(server.status)}
            </span>
          </div>
        </div>
      </div>

      {/* System Information */}
      {server.status === 'CONNECTED' && systemInfo && (
        <div className="px-6 py-4 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-700 mb-3">ข้อมูลระบบ</h4>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* OS Info */}
            <div className="col-span-2">
              <div className="flex items-center text-gray-600">
                <Activity className="h-4 w-4 mr-2" />
                <span>{systemInfo.os} {systemInfo.arch}</span>
              </div>
            </div>

            {/* Uptime */}
            {systemInfo.uptime && (
              <div className="flex items-center text-gray-600">
                <Clock className="h-4 w-4 mr-2" />
                <span>{formatUptime(systemInfo.uptime)}</span>
              </div>
            )}

            {/* CPU Load */}
            {systemInfo.loadAverage && (
              <div className="flex items-center text-gray-600">
                <Cpu className="h-4 w-4 mr-2" />
                <span>Load: {systemInfo.loadAverage[0].toFixed(2)}</span>
              </div>
            )}

            {/* Memory Usage - แก้ไขการแสดงผลให้ถูกต้อง */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center text-gray-600">
                  <MemoryStick className="h-4 w-4 mr-2" />
                  <span>Memory</span>
                </div>
                <span className="text-xs text-gray-500">
                  {formatBytes(systemInfo.totalMemory - systemInfo.freeMemory)} / {formatBytes(systemInfo.totalMemory)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    memoryUsage > 90 ? 'bg-red-600' : 
                    memoryUsage > 70 ? 'bg-yellow-600' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(memoryUsage, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {memoryUsage.toFixed(1)}% ใช้งาน
              </div>
            </div>

            {/* Disk Usage */}
            {primaryDisk && (
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center text-gray-600">
                    <HardDrive className="h-4 w-4 mr-2" />
                    <span>Disk ({primaryDisk.mountPoint})</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {primaryDisk.used} / {primaryDisk.size}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      parseInt(primaryDisk.usePercent) > 90 ? 'bg-red-600' :
                      parseInt(primaryDisk.usePercent) > 70 ? 'bg-yellow-600' : 'bg-green-600'
                    }`}
                    style={{ width: primaryDisk.usePercent }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {primaryDisk.usePercent} ใช้งาน
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Server Details */}
      <div className="px-6 py-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-500">ผู้ใช้:</dt>
            <dd className="text-gray-900 font-medium">{server.username}</dd>
          </div>
          <div>
            <dt className="text-gray-500">สถานะ:</dt>
            <dd className={`font-medium ${
              server.isActive ? 'text-green-600' : 'text-red-600'
            }`}>
              {server.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-gray-500">ตรวจสอบล่าสุด:</dt>
            <dd className="text-gray-900">
              {server.lastChecked ? formatRelativeTime(server.lastChecked) : 'ยังไม่ได้ตรวจสอบ'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            {server.status === 'CONNECTED' ? (
              <button
                onClick={() => onTerminal(server.id)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-150"
              >
                <Terminal className="h-4 w-4 mr-1" />
                Terminal
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
              >
                {isConnecting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
                    เชื่อมต่อ...
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4 mr-1" />
                    เชื่อมต่อ
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => onEdit(server)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"
            >
              <Edit className="h-4 w-4 mr-1" />
              แก้ไข
            </button>
            
            <button
              onClick={() => onDelete(server.id)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              ลบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}