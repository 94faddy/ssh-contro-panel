'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Server, 
  Plus, 
  Terminal as TerminalIcon, 
  Info, 
  Zap, 
  Shield, 
  Grid3x3, 
  Grid2x2, 
  LayoutGrid,
  Monitor,
  Cpu,
  Activity,
  Wifi,
  Settings,
  Maximize,
  X
} from 'lucide-react';
import Layout from '@/components/Layout';
import Terminal from '@/components/Terminal';
import type { Server as ServerType, ApiResponse } from '@/types';

export default function TerminalPage() {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [activeTerminals, setActiveTerminals] = useState<{ id: string; serverId: number; serverName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'auto' | 'grid' | 'stacked'>('auto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const searchParams = useSearchParams();
  const initialServerId = searchParams?.get('server');

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    // Auto-open terminal if server ID is provided in URL
    if (initialServerId && servers.length > 0) {
      const server = servers.find(s => s.id === parseInt(initialServerId));
      if (server && server.status === 'CONNECTED') {
        openTerminal(server.id, server.name);
      }
    }
  }, [initialServerId, servers]);

  // Handle fullscreen mode
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fetchServers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('/api/servers?status=CONNECTED&limit=100', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: ApiResponse<ServerType[]> = await response.json();
        if (data.success) {
          setServers(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const openTerminal = (serverId: number, serverName: string) => {
    // Check if terminal already exists
    const existingTerminal = activeTerminals.find(t => t.serverId === serverId);
    if (existingTerminal) {
      return; // Terminal already open for this server
    }

    // Performance optimization: limit terminals based on device capabilities
    const maxRecommendedTerminals = window.innerWidth > 1920 ? 12 : 
                                   window.innerWidth > 1366 ? 8 : 
                                   window.innerWidth > 768 ? 6 : 3;
    
    if (activeTerminals.length >= maxRecommendedTerminals) {
      alert(`จำกัดจำนวน Terminal สูงสุด ${maxRecommendedTerminals} หน้าต่างเพื่อประสิทธิภาพที่ดี\nกรุณาปิด Terminal เก่าก่อนเปิดใหม่`);
      return;
    }

    const terminalId = `terminal-${serverId}-${Date.now()}`;
    const newTerminal = {
      id: terminalId,
      serverId,
      serverName
    };
    
    setActiveTerminals(prev => [...prev, newTerminal]);
  };

  const closeTerminal = (terminalId: string) => {
    setActiveTerminals(prev => prev.filter(t => t.id !== terminalId));
  };

  const closeAllTerminals = () => {
    if (activeTerminals.length > 0) {
      const confirmClose = window.confirm(`คุณต้องการปิด Terminal ทั้งหมด ${activeTerminals.length} หน้าต่างหรือไม่?`);
      if (confirmClose) {
        setActiveTerminals([]);
      }
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  // Get grid layout class based on mode and terminal count
  const getLayoutClass = () => {
    const count = activeTerminals.length;
    
    if (layoutMode === 'stacked') {
      return 'grid grid-cols-1 gap-4';
    }
    
    if (layoutMode === 'grid') {
      if (count <= 1) return 'grid grid-cols-1 gap-6';
      if (count <= 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-6';
      if (count <= 4) return 'grid grid-cols-1 lg:grid-cols-2 gap-4';
      if (count <= 6) return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4';
      if (count <= 9) return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3';
      return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3';
    }
    
    // Auto layout - optimized for readability
    if (count === 1) return 'grid grid-cols-1 gap-6';
    if (count === 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-6';
    if (count === 3) return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6';
    if (count === 4) return 'grid grid-cols-1 lg:grid-cols-2 gap-4';
    if (count <= 6) return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4';
    if (count <= 9) return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3';
    return 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3';
  };

  const connectedServers = servers.filter(server => server.status === 'CONNECTED');

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <TerminalIcon className="h-8 w-8 mr-3 text-blue-600" />
                Enhanced SSH Terminal
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                เชื่อมต่อและควบคุมเซิร์ฟเวอร์ผ่าน SSH Terminal แบบ Real-time พร้อมฟีเจอร์ขั้นสูง
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowHelp(!showHelp)}
                className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-md transition-colors ${
                  showHelp 
                    ? 'border-blue-300 text-blue-700 bg-blue-50' 
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                }`}
              >
                <Info className="h-4 w-4 mr-1" />
                Help
              </button>
              
              {/* Layout Switcher */}
              {activeTerminals.length > 1 && (
                <div className="flex items-center space-x-0 border border-gray-300 rounded-md overflow-hidden">
                  <button
                    onClick={() => setLayoutMode('auto')}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      layoutMode === 'auto' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    title="Auto Layout"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLayoutMode('grid')}
                    className={`px-3 py-2 text-sm font-medium transition-colors border-l border-r border-gray-300 ${
                      layoutMode === 'grid' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    title="Grid Layout"
                  >
                    <Grid2x2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLayoutMode('stacked')}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                      layoutMode === 'stacked' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    title="Stacked Layout"
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                <Maximize className="h-4 w-4" />
              </button>
              
              {activeTerminals.length > 0 && (
                <button
                  onClick={closeAllTerminals}
                  className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100"
                >
                  <X className="h-4 w-4 mr-1" />
                  Close All ({activeTerminals.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Help Panel */}
        {showHelp && (
          <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-4 flex items-center">
              <Info className="h-5 w-5 mr-2" />
              💡 คู่มือการใช้งาน Enhanced Terminal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-blue-800">
              <div>
                <h4 className="font-medium mb-2 flex items-center">
                  <Zap className="h-4 w-4 mr-1" />
                  ฟีเจอร์ใหม่:
                </h4>
                <ul className="space-y-1">
                  <li>• <kbd className="px-1 py-0.5 bg-blue-200 rounded">Tab</kbd> - Auto-completion ไฟล์และคำสั่ง (ใช้ของเซิร์ฟเวอร์จริง)</li>
                  <li>• <kbd className="px-1 py-0.5 bg-blue-200 rounded">↑/↓</kbd> - เรียกดูประวัติคำสั่ง</li>
                  <li>• <kbd className="px-1 py-0.5 bg-blue-200 rounded">Ctrl+C</kbd> - ยกเลิกคำสั่งที่กำลังทำงาน</li>
                  <li>• รองรับคำสั่งทุกอย่างที่มีในเซิร์ฟเวอร์</li>
                  <li>• แสดง working directory แบบ real-time</li>
                  <li>• รองรับคำสั่ง cd และจำ path ที่เปลี่ยน</li>
                  <li>• เปิดได้หลาย terminal พร้อมกัน</li>
                  <li>• ทำงานเหมือน SSH terminal จริงๆ</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center">
                  <Activity className="h-4 w-4 mr-1" />
                  คำสั่งที่รองรับ:
                </h4>
                <ul className="space-y-1">
                  <li>• <strong>ทุกคำสั่ง Linux/Unix</strong> ที่มีในเซิร์ฟเวอร์</li>
                  <li>• <code>ls, cd, pwd, mkdir, cp, mv, rm</code> - จัดการไฟล์</li>
                  <li>• <code>top, htop, ps, kill</code> - จัดการ process</li>
                  <li>• <code>df, du, free</code> - ดูข้อมูลระบบ</li>
                  <li>• <code>systemctl, service</code> - จัดการ services</li>
                  <li>• <code>docker, kubectl</code> - container management</li>
                  <li>• <code>git, npm, pip</code> - development tools</li>
                  <li>• <code>curl, wget, rsync</code> - network tools</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 flex items-center">
                  <Shield className="h-4 w-4 mr-1" />
                  ข้อควรระวัง:
                </h4>
                <ul className="space-y-1">
                  <li>• หลีกเลี่ยงคำสั่งที่อันตราย เช่น <code>rm -rf</code></li>
                  <li>• ใช้ <code>sudo</code> เฉพาะเมื่อจำเป็น</li>
                  <li>• สำรองข้อมูลก่อนทำการแก้ไขสำคัญ</li>
                  <li>• ตรวจสอบ path ก่อนลบไฟล์</li>
                  <li>• ใช้ <code>exit</code> เพื่อปิด terminal อย่างปลอดภัย</li>
                  <li>• <kbd>F11</kbd> สำหรับ fullscreen mode</li>
                </ul>
              </div>
            </div>
            
            {/* Layout Help */}
            {activeTerminals.length > 1 && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">การจัดเรียง Terminal:</h4>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center">
                    <LayoutGrid className="h-4 w-4 mr-1 text-blue-600" />
                    <span>Auto - จัดเรียงอัตโนมัติ</span>
                  </div>
                  <div className="flex items-center">
                    <Grid2x2 className="h-4 w-4 mr-1 text-blue-600" />
                    <span>Grid - จัดเรียงแบบตาราง</span>
                  </div>
                  <div className="flex items-center">
                    <Grid3x3 className="h-4 w-4 mr-1 text-blue-600" />
                    <span>Stack - จัดเรียงแนวตั้ง</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Server Selection */}
            {activeTerminals.length === 0 && (
              <div className="bg-white shadow-soft rounded-lg p-6 mb-8">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Server className="h-5 w-5 mr-2 text-blue-600" />
                  เลือกเซิร์ฟเวอร์เพื่อเปิด Terminal
                </h3>
                
                {connectedServers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
                      <Server className="h-full w-full" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      ไม่มีเซิร์ฟเวอร์ที่เชื่อมต่อแล้ว
                    </h3>
                    <p className="text-gray-500 mb-6">
                      กรุณาเชื่อมต่อเซิร์ฟเวอร์ก่อนใช้งาน Terminal
                    </p>
                    <a
                      href="/dashboard/servers"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      จัดการเซิร์ฟเวอร์
                    </a>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {connectedServers.map((server) => {
                      const hasTerminal = activeTerminals.some(t => t.serverId === server.id);
                      return (
                        <div
                          key={server.id}
                          className={`border rounded-lg p-4 transition-all duration-200 cursor-pointer ${
                            hasTerminal 
                              ? 'border-green-300 bg-green-50 cursor-not-allowed' 
                              : 'border-gray-200 hover:border-blue-300 hover:shadow-md hover:scale-105'
                          }`}
                          onClick={() => !hasTerminal && openTerminal(server.id, server.name)}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-lg ${hasTerminal ? 'bg-green-100' : 'bg-blue-100'}`}>
                              <TerminalIcon className={`h-6 w-6 ${hasTerminal ? 'text-green-700' : 'text-blue-600'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-gray-900 truncate">
                                {server.name}
                              </h4>
                              <p className="text-xs text-gray-500 truncate">
                                {server.host}:{server.port}
                              </p>
                              <div className="mt-1 flex items-center space-x-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  <Wifi className="h-3 w-3 mr-1" />
                                  เชื่อมต่อแล้ว
                                </span>
                                {hasTerminal && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    <Monitor className="h-3 w-3 mr-1" />
                                    Terminal เปิดอยู่
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Active Terminals Management */}
            {activeTerminals.length > 0 && (
              <div className="space-y-6">
                {/* Terminal Control Panel */}
                <div className="bg-white shadow-soft rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center">
                      <Activity className="h-5 w-5 mr-2 text-green-600" />
                      Active Terminals ({activeTerminals.length}/{connectedServers.length})
                    </h3>
                    
                    <div className="flex items-center space-x-3">
                      {/* Server Status Indicators */}
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Cpu className="h-4 w-4" />
                        <span>{connectedServers.length} connected</span>
                      </div>
                      
                      {/* Add More Terminals */}
                      <div className="flex space-x-2">
                        {connectedServers
                          .filter(server => !activeTerminals.some(t => t.serverId === server.id))
                          .map((server) => (
                            <button
                              key={server.id}
                              onClick={() => openTerminal(server.id, server.name)}
                              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors duration-150"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              {server.name}
                            </button>
                          ))}
                        {connectedServers.filter(server => !activeTerminals.some(t => t.serverId === server.id)).length === 0 && (
                          <span className="text-sm text-gray-500 italic">
                            All connected servers have active terminals
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Active Terminal Tabs */}
                  <div className="flex flex-wrap gap-2">
                    {activeTerminals.map((terminal) => {
                      const server = servers.find(s => s.id === terminal.serverId);
                      return (
                        <div
                          key={terminal.id}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800 group hover:bg-blue-200 transition-colors"
                        >
                          <TerminalIcon className="h-4 w-4 mr-2" />
                          <span className="font-medium">{terminal.serverName}</span>
                          {server && (
                            <span className="ml-2 text-xs text-blue-600">
                              ({server.host})
                            </span>
                          )}
                          <button
                            onClick={() => closeTerminal(terminal.id)}
                            className="ml-2 text-blue-600 hover:text-blue-800 font-bold opacity-70 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Terminal Windows - Dynamic Layout */}
                <div className={getLayoutClass()}>
                  {activeTerminals.map((terminal) => (
                    <div key={terminal.id} className="relative">
                      <Terminal
                        serverId={terminal.serverId}
                        serverName={terminal.serverName}
                        onClose={() => closeTerminal(terminal.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Enhanced Status Bar */}
        {activeTerminals.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-gray-800 to-gray-900 text-white px-4 py-3 rounded-lg text-sm shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="font-medium">{activeTerminals.length} terminal(s) active</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  <span>Enhanced mode enabled</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Wifi className="h-4 w-4 text-blue-400" />
                  <span>{connectedServers.length} server(s) connected</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Monitor className="h-4 w-4 text-purple-400" />
                  <span>Layout: {layoutMode}</span>
                </div>
              </div>
              <div className="text-gray-400 text-xs">
                <kbd className="px-1 py-0.5 bg-gray-700 rounded">F11</kbd> Fullscreen |
                <kbd className="px-1 py-0.5 bg-gray-700 rounded ml-1">Ctrl+Shift+C</kbd> Copy |
                <kbd className="px-1 py-0.5 bg-gray-700 rounded ml-1">Ctrl+Shift+V</kbd> Paste
              </div>
            </div>
          </div>
        )}

        {/* Performance Notice */}
        {activeTerminals.length > 6 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center">
              <Info className="h-5 w-5 text-yellow-600 mr-2" />
              <div className="text-sm text-yellow-800">
                <strong>Performance Notice:</strong> คุณเปิด Terminal จำนวนมาก ({activeTerminals.length} หน้าต่าง) 
                อาจส่งผลต่อประสิทธิภาพบนอุปกรณ์ที่มีสเปคต่ำ
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}