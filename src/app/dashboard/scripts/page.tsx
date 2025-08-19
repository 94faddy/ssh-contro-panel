'use client';

import { useState, useEffect } from 'react';
import { Play, Square, Search, Filter, Loader, CheckCircle, XCircle, Clock } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import Layout from '@/components/Layout';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import type { Server, ApiResponse } from '@/types';

interface ScriptExecution {
  id: string;
  serverId: number;
  serverName: string;
  status: 'running' | 'success' | 'failed';
  output: string;
  error?: string;
  startTime: Date;
  endTime?: Date;
  progress?: number;
}

// ฟังก์ชันสำหรับสร้าง WebSocket URL ที่รองรับ Cloudflare Proxy
function getWebSocketURL(): string {
  if (typeof window === 'undefined') return '';
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  
  // ตรวจสอบว่าใช้ Cloudflare Proxy หรือไม่
  const isCloudflareProxy = hostname.includes('.cloud') || hostname.includes('cloudflare');
  
  if (isCloudflareProxy) {
    // สำหรับ Cloudflare Proxy ใช้ HTTPS/HTTP endpoint
    return `${window.location.protocol}//${hostname}`;
  } else {
    // สำหรับการใช้งานปกติ
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3126';
    return `${protocol}//${hostname}:${wsPort}`;
  }
}

export default function ScriptsPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const [scriptName, setScriptName] = useState('');
  const [command, setCommand] = useState('');
  const [executions, setExecutions] = useState<ScriptExecution[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isCloudflareProxy, setIsCloudflareProxy] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // ตรวจสอบว่าใช้ Cloudflare Proxy หรือไม่
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isProxy = hostname.includes('.cloud') || hostname.includes('cloudflare');
      setIsCloudflareProxy(isProxy);
      console.log('Scripts page - Cloudflare Proxy detected:', isProxy);
    }
  }, []);

  useEffect(() => {
    fetchServers();
    initializeSocket();
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const fetchServers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/servers?status=CONNECTED&limit=100', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: ApiResponse<Server[]> = await response.json();
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

  const initializeSocket = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    setConnectionStatus('connecting');

    const wsUrl = getWebSocketURL();
    console.log('Scripts - Connecting to WebSocket:', wsUrl);
    console.log('Scripts - Cloudflare Proxy mode:', isCloudflareProxy);

    // สร้าง Socket.IO connection ที่รองรับ Cloudflare Proxy
    const socketOptions: any = {
      auth: { token },
      forceNew: true,
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 5,
      randomizationFactor: 0.5
    };

    if (isCloudflareProxy) {
      // สำหรับ Cloudflare Proxy ใช้ polling เป็นหลัก
      socketOptions.transports = ['polling', 'websocket'];
      socketOptions.upgrade = true;
      socketOptions.rememberUpgrade = false;
      socketOptions.pingTimeout = 60000;
      socketOptions.pingInterval = 25000;
    } else {
      // สำหรับการใช้งานปกติ
      socketOptions.transports = ['websocket', 'polling'];
      socketOptions.upgrade = true;
    }

    const newSocket = io(wsUrl, socketOptions);

    newSocket.on('connect', () => {
      console.log('Scripts - Socket.IO connected with transport:', newSocket.io.engine.transport.name);
      setSocket(newSocket);
      setConnectionStatus('connected');
      setReconnectAttempts(0);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Scripts - Socket.IO connection error:', error);
      setConnectionStatus('disconnected');
      const attempts = reconnectAttempts + 1;
      setReconnectAttempts(attempts);
      
      if (attempts >= 5) {
        Swal.fire({
          title: 'Connection Failed',
          text: 'Failed to connect to script execution service. Please check your internet connection.',
          icon: 'error'
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Scripts - Socket.IO disconnected:', reason);
      setConnectionStatus('disconnected');
      setSocket(null);
      
      // Auto-reconnect only for network issues
      if (reason === 'io server disconnect' || reason === 'ping timeout' || reason === 'transport close') {
        setTimeout(() => {
          if (reconnectAttempts < 3) {
            console.log('Scripts - Attempting to reconnect...');
            initializeSocket();
          }
        }, 2000 + (reconnectAttempts * 1000));
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Scripts - Socket.IO reconnected after', attemptNumber, 'attempts');
      setReconnectAttempts(0);
    });

    // Transport upgrade events
    newSocket.io.engine.on('upgrade', () => {
      console.log('Scripts - Upgraded to transport:', newSocket.io.engine.transport.name);
    });

    newSocket.io.engine.on('upgradeError', (error) => {
      console.log('Scripts - Upgrade error:', error);
    });

    newSocket.on('script:started', (data: { 
      executionId: string; 
      serverCount: number;
      servers: { id: number; name: string }[];
    }) => {
      setCurrentExecutionId(data.executionId);
      // Initialize executions for each server
      const newExecutions: ScriptExecution[] = data.servers.map(server => ({
        id: `${data.executionId}-${server.id}`,
        serverId: server.id,
        serverName: server.name,
        status: 'running',
        output: '',
        startTime: new Date(),
        progress: 0
      }));
      setExecutions(newExecutions);
    });

    newSocket.on('script:progress', (data: {
      executionId: string;
      serverId: number;
      serverName: string;
      status: 'running' | 'success' | 'failed';
      output?: string;
      error?: string;
      exitCode?: number;
    }) => {
      setExecutions(prev => prev.map(exec => 
        exec.serverId === data.serverId ? {
          ...exec,
          status: data.status,
          output: data.output || exec.output,
          error: data.error,
          endTime: data.status !== 'running' ? new Date() : exec.endTime,
          progress: data.status !== 'running' ? 100 : 50
        } : exec
      ));
    });

    newSocket.on('script:completed', (data: {
      executionId: string;
      totalServers: number;
      successCount: number;
      failedCount: number;
    }) => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
      Swal.fire({
        title: 'Script Execution Complete',
        text: `Completed on ${data.totalServers} servers. ${data.successCount} successful, ${data.failedCount} failed.`,
        icon: data.failedCount === 0 ? 'success' : 'warning',
        confirmButtonText: 'OK'
      });
    });

    newSocket.on('script:error', (data: { error: string }) => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
      Swal.fire({
        title: 'Script Execution Error',
        text: data.error,
        icon: 'error'
      });
    });

    newSocket.on('script:cancelled', () => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
      Swal.fire({
        title: 'Script Cancelled',
        text: 'Script execution has been cancelled.',
        icon: 'info'
      });
    });
  };

  const handleServerToggle = (serverId: number) => {
    setSelectedServers(prev => 
      prev.includes(serverId) 
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleSelectAll = () => {
    const connectedServerIds = servers
      .filter(server => server.status === 'CONNECTED')
      .map(server => server.id);
    
    setSelectedServers(
      selectedServers.length === connectedServerIds.length 
        ? [] 
        : connectedServerIds
    );
  };

  const validateScript = (): boolean => {
    if (!scriptName.trim()) {
      Swal.fire({
        title: 'Script Name Required',
        text: 'Please enter a script name',
        icon: 'warning'
      });
      return false;
    }

    if (!command.trim()) {
      Swal.fire({
        title: 'Command Required',
        text: 'Please enter a command to execute',
        icon: 'warning'
      });
      return false;
    }

    if (selectedServers.length === 0) {
      Swal.fire({
        title: 'No Servers Selected',
        text: 'Please select at least one server',
        icon: 'warning'
      });
      return false;
    }

    if (connectionStatus !== 'connected') {
      Swal.fire({
        title: 'Connection Not Available',
        text: 'WebSocket connection is not established. Please wait for connection or refresh the page.',
        icon: 'warning'
      });
      return false;
    }

    // Security check for dangerous commands
    const dangerousCommands = [
      'rm -rf /',
      'rm -rf *',
      'mkfs',
      'dd if=/dev/zero',
      'format',
      'fdisk',
      'parted',
      ':(){ :|:& };:'
    ];

    const lowerCommand = command.toLowerCase();
    if (dangerousCommands.some(dangerous => lowerCommand.includes(dangerous))) {
      Swal.fire({
        title: 'Dangerous Command Detected',
        text: 'This command contains potentially dangerous operations and cannot be executed.',
        icon: 'error'
      });
      return false;
    }

    return true;
  };

  const runScript = async () => {
    if (!validateScript() || !socket) return;

    const result = await Swal.fire({
      title: 'Confirm Script Execution',
      text: `Execute "${scriptName}" on ${selectedServers.length} servers?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Execute',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      setIsRunning(true);
      setExecutions([]);

      socket.emit('script:run', {
        scriptName: scriptName.trim(),
        command: command.trim(),
        serverIds: selectedServers
      });
    }
  };

  const cancelScript = () => {
    if (socket && currentExecutionId) {
      socket.emit('script:cancel', { executionId: currentExecutionId });
      setIsRunning(false);
      setCurrentExecutionId(null);
    }
  };

  const clearResults = () => {
    setExecutions([]);
  };

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         server.host.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || server.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const connectedServers = filteredServers.filter(server => server.status === 'CONNECTED');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Script Runner</h1>
          <div className="flex items-center justify-between">
            <p className="mt-1 text-sm text-gray-500">
              Execute scripts on multiple servers simultaneously
            </p>
            
            {/* Connection Status Indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`}></div>
              <span className="text-sm text-gray-600">
                {connectionStatus === 'connected' ? 'Connected' :
                 connectionStatus === 'connecting' ? 'Connecting...' :
                 'Disconnected'}
              </span>
              {isCloudflareProxy && (
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                  Cloudflare
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Script Configuration */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow-soft rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Script Configuration</h2>
              
              <div className="space-y-4">
                {/* Script Name */}
                <div>
                  <label className="form-label">Script Name</label>
                  <input
                    type="text"
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    className="form-input"
                    placeholder="e.g., System Update, Deploy Application"
                    disabled={isRunning}
                  />
                </div>

                {/* Command */}
                <div>
                  <label className="form-label">Command</label>
                  <textarea
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="form-input h-32 font-mono text-sm"
                    placeholder="Enter your command here...
Examples:
sudo apt update && sudo apt upgrade -y
docker-compose pull && docker-compose up -d
systemctl restart nginx"
                    disabled={isRunning}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex space-x-3">
                    {!isRunning ? (
                      <button
                        onClick={runScript}
                        disabled={selectedServers.length === 0 || connectionStatus !== 'connected'}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Execute Script
                      </button>
                    ) : (
                      <button
                        onClick={cancelScript}
                        className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Cancel Execution
                      </button>
                    )}

                    {executions.length > 0 && (
                      <button
                        onClick={clearResults}
                        className="btn-outline"
                        disabled={isRunning}
                      >
                        Clear Results
                      </button>
                    )}
                  </div>

                  <div className="text-sm text-gray-500">
                    {selectedServers.length} of {connectedServers.length} servers selected
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Results */}
            {executions.length > 0 && (
              <div className="bg-white shadow-soft rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Execution Results</h2>
                
                <div className="space-y-4">
                  {executions.map((execution) => (
                    <div key={execution.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(execution.status)}
                          <h3 className="font-medium text-gray-900">{execution.serverName}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(execution.status)}`}>
                            {execution.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500">
                          {execution.endTime && (
                            <span>
                              {formatDuration(execution.endTime.getTime() - execution.startTime.getTime())}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {execution.status === 'running' && (
                        <div className="mb-3">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${execution.progress || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Output */}
                      {execution.output && (
                        <div className="mb-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-1">Output:</h4>
                          <pre className="bg-gray-900 text-green-400 p-3 rounded text-sm overflow-x-auto max-h-40">
                            {execution.output}
                          </pre>
                        </div>
                      )}

                      {/* Error */}
                      {execution.error && (
                        <div>
                          <h4 className="text-sm font-medium text-red-700 mb-1">Error:</h4>
                          <pre className="bg-red-50 text-red-800 p-3 rounded text-sm overflow-x-auto max-h-40">
                            {execution.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Server Selection */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow-soft rounded-lg p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Server Selection</h2>
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                  disabled={isRunning}
                >
                  {selectedServers.length === connectedServers.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Search and Filter */}
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search servers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 form-input"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="form-input"
                >
                  <option value="">All Status</option>
                  <option value="CONNECTED">Connected</option>
                  <option value="DISCONNECTED">Disconnected</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>

              {/* Server List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="text-center py-4">
                    <Loader className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                  </div>
                ) : connectedServers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    No connected servers found
                  </div>
                ) : (
                  connectedServers.map((server) => (
                    <label
                      key={server.id}
                      className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors duration-150 ${
                        selectedServers.includes(server.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedServers.includes(server.id)}
                        onChange={() => handleServerToggle(server.id)}
                        disabled={isRunning}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="ml-3 flex-1">
                        <div className="font-medium text-gray-900">{server.name}</div>
                        <div className="text-sm text-gray-500">{server.host}</div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        server.status === 'CONNECTED' ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                    </label>
                  ))
                )}
              </div>

              {/* Selection Summary */}
              {selectedServers.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm font-medium text-blue-900">
                    {selectedServers.length} server{selectedServers.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Scripts will execute simultaneously on all selected servers
                  </div>
                </div>
              )}

              {/* Connection Warning */}
              {connectionStatus !== 'connected' && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-sm text-yellow-800">
                    <strong>Connection Issue:</strong> Script execution service is not connected. 
                    {reconnectAttempts > 0 && ` Retry attempt: ${reconnectAttempts}/5`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}