'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Square, Search, Filter, Loader, Loader2, CheckCircle, XCircle, Clock, Terminal as TerminalIcon } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import Layout from '@/components/Layout';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import type { Server, ApiResponse } from '@/types';

interface ScriptExecution {
  id: string;
  serverId: number;
  serverName: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  output: string;
  error?: string;
  startTime: Date;
  endTime?: Date;
  progress?: number;
  exitCode?: number;
  isStreaming?: boolean;
}

// Helper function to get WebSocket URL
function getWebSocketUrl(): string {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  
  if (wsUrl) {
    return wsUrl;
  }
  
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const wsPort = process.env.WS_PORT || '3005';
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:${wsPort}`;
    }
    
    return `${protocol}//ws-${hostname}`;
  }
  
  return 'http://localhost:3005';
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
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Refs for auto-scrolling each server's output
  const outputRefs = useRef<{ [key: number]: HTMLPreElement | null }>({});

  useEffect(() => {
    fetchServers();
    initializeSocket();
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll) {
      Object.values(outputRefs.current).forEach(ref => {
        if (ref) {
          ref.scrollTop = ref.scrollHeight;
        }
      });
    }
  }, [executions, autoScroll]);

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

    const wsUrl = getWebSocketUrl();
    console.log('Scripts page connecting to WebSocket:', wsUrl);

    const newSocket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected for scripts');
      setSocket(newSocket);
    });

    // Handle script started
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
        status: 'pending',
        output: '',
        startTime: new Date(),
        progress: 0,
        isStreaming: true
      }));
      setExecutions(newExecutions);
    });

    // Handle streaming output - REAL-TIME DATA
    newSocket.on('script:stream', (data: {
      executionId: string;
      serverId: number;
      serverName: string;
      type: 'stdout' | 'stderr';
      data: string;
      timestamp: string;
    }) => {
      setExecutions(prev => prev.map(exec => {
        if (exec.serverId === data.serverId) {
          return {
            ...exec,
            status: 'running',
            output: data.type === 'stdout' 
              ? exec.output + data.data 
              : exec.output,
            error: data.type === 'stderr' 
              ? (exec.error || '') + data.data 
              : exec.error,
            isStreaming: true
          };
        }
        return exec;
      }));
    });

    // Handle progress updates
    newSocket.on('script:progress', (data: {
      executionId: string;
      serverId: number;
      serverName: string;
      status: 'running' | 'success' | 'failed';
      output?: string;
      error?: string;
      exitCode?: number;
      isComplete?: boolean;
    }) => {
      setExecutions(prev => prev.map(exec => {
        if (exec.serverId === data.serverId) {
          const newExec = {
            ...exec,
            status: data.status,
            exitCode: data.exitCode,
            isStreaming: !data.isComplete,
            progress: data.isComplete ? 100 : exec.progress
          };
          
          // Only update output/error if complete (streaming already handles incremental updates)
          if (data.isComplete) {
            newExec.endTime = new Date();
          }
          
          return newExec;
        }
        return exec;
      }));
    });

    // Handle script completed
    newSocket.on('script:completed', (data: {
      executionId: string;
      totalServers: number;
      successCount: number;
      failedCount: number;
    }) => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
      // Mark all executions as not streaming
      setExecutions(prev => prev.map(exec => ({
        ...exec,
        isStreaming: false
      })));
      
      Swal.fire({
        title: 'Script Execution Complete',
        text: `Completed on ${data.totalServers} servers. ${data.successCount} successful, ${data.failedCount} failed.`,
        icon: data.failedCount === 0 ? 'success' : 'warning',
        confirmButtonText: 'OK'
      });
    });

    // Handle script error
    newSocket.on('script:error', (data: { error: string }) => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
      setExecutions(prev => prev.map(exec => ({
        ...exec,
        isStreaming: false
      })));
      
      Swal.fire({
        title: 'Script Execution Error',
        text: data.error,
        icon: 'error'
      });
    });

    // Handle script cancelled
    newSocket.on('script:cancelled', (data: { executionId: string }) => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
      setExecutions(prev => prev.map(exec => ({
        ...exec,
        status: exec.status === 'running' || exec.status === 'pending' ? 'failed' : exec.status,
        isStreaming: false,
        error: exec.status === 'running' || exec.status === 'pending' 
          ? (exec.error || '') + '\n[Cancelled by user]' 
          : exec.error
      })));
      
      Swal.fire({
        title: 'Script Cancelled',
        text: 'Script execution was cancelled.',
        icon: 'info'
      });
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      Swal.fire({
        title: 'Connection Error',
        text: `Failed to connect to WebSocket server: ${error.message}`,
        icon: 'error'
      });
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setSocket(null);
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
      html: `
        <div class="text-left">
          <p class="mb-2">Execute "<strong>${scriptName}</strong>" on <strong>${selectedServers.length}</strong> server(s)?</p>
          <div class="bg-gray-100 p-3 rounded mt-3">
            <code class="text-sm">${command}</code>
          </div>
          <p class="text-sm text-gray-500 mt-3">
            <strong>Note:</strong> Output will be streamed in real-time.
          </p>
        </div>
      `,
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
      Swal.fire({
        title: 'Cancel Script?',
        text: 'Are you sure you want to cancel the running script?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, Cancel',
        cancelButtonText: 'No, Continue'
      }).then((result) => {
        if (result.isConfirmed) {
          socket.emit('script:cancel', { executionId: currentExecutionId });
        }
      });
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

  const getStatusIcon = (status: string, isStreaming?: boolean) => {
    if (isStreaming && (status === 'running' || status === 'pending')) {
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    }
    
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-600" />;
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
      case 'pending':
        return 'bg-gray-100 text-gray-800';
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
          <p className="mt-1 text-sm text-gray-500">
            Execute scripts on multiple servers simultaneously with <span className="text-blue-600 font-medium">real-time streaming output</span>
          </p>
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
                        disabled={selectedServers.length === 0}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Execute Script
                      </button>
                    ) : (
                      <button
                        onClick={cancelScript}
                        className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center"
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Cancel Execution
                      </button>
                    )}

                    {executions.length > 0 && !isRunning && (
                      <button
                        onClick={clearResults}
                        className="btn-outline"
                      >
                        Clear Results
                      </button>
                    )}
                  </div>

                  <div className="flex items-center space-x-4">
                    {isRunning && (
                      <div className="flex items-center text-blue-600 text-sm">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Streaming output...
                      </div>
                    )}
                    <div className="text-sm text-gray-500">
                      {selectedServers.length} of {connectedServers.length} servers selected
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Results */}
            {executions.length > 0 && (
              <div className="bg-white shadow-soft rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900 flex items-center">
                    <TerminalIcon className="h-5 w-5 mr-2 text-blue-600" />
                    Execution Results
                    {isRunning && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Live
                      </span>
                    )}
                  </h2>
                  
                  <label className="flex items-center text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="mr-2 rounded"
                    />
                    Auto-scroll
                  </label>
                </div>
                
                <div className="space-y-4">
                  {executions.map((execution) => (
                    <div key={execution.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Server Header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center space-x-3">
                          {getStatusIcon(execution.status, execution.isStreaming)}
                          <h3 className="font-medium text-gray-900">{execution.serverName}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(execution.status)}`}>
                            {execution.isStreaming && execution.status === 'running' ? 'Streaming...' : execution.status}
                          </span>
                          {execution.exitCode !== undefined && execution.exitCode !== 0 && (
                            <span className="text-xs text-red-600">
                              Exit code: {execution.exitCode}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {execution.endTime && (
                            <span>
                              {formatDuration(execution.endTime.getTime() - execution.startTime.getTime())}
                            </span>
                          )}
                          {execution.isStreaming && !execution.endTime && (
                            <span className="text-blue-600 flex items-center">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Running...
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Output Container */}
                      <div className="p-4 bg-gray-900">
                        {/* Stdout */}
                        {(execution.output || execution.isStreaming) && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-xs font-medium text-gray-400 uppercase">Output</h4>
                              {execution.isStreaming && (
                                <div className="flex items-center text-xs text-blue-400">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Streaming...
                                </div>
                              )}
                            </div>
                            <pre 
                              ref={(el) => { outputRefs.current[execution.serverId] = el; }}
                              className="bg-black text-green-400 p-3 rounded text-sm overflow-auto max-h-60 font-mono whitespace-pre-wrap"
                            >
                              {execution.output || (execution.isStreaming ? 'Waiting for output...' : '')}
                              {execution.isStreaming && (
                                <span className="inline-block w-2 h-4 bg-green-400 ml-1 animate-pulse"></span>
                              )}
                            </pre>
                          </div>
                        )}

                        {/* Stderr */}
                        {execution.error && (
                          <div>
                            <h4 className="text-xs font-medium text-red-400 uppercase mb-1">Errors</h4>
                            <pre className="bg-red-950 text-red-400 p-3 rounded text-sm overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                              {execution.error}
                            </pre>
                          </div>
                        )}

                        {/* No output message */}
                        {!execution.output && !execution.error && !execution.isStreaming && execution.status === 'success' && (
                          <div className="text-gray-500 text-sm italic">
                            Command completed successfully with no output.
                          </div>
                        )}
                      </div>
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
                  connectedServers.map((server) => {
                    const execution = executions.find(e => e.serverId === server.id);
                    const isExecuting = execution?.isStreaming;
                    
                    return (
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
                          <div className="font-medium text-gray-900 flex items-center">
                            {server.name}
                            {isExecuting && (
                              <Loader2 className="h-3 w-3 ml-2 animate-spin text-blue-600" />
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{server.host}</div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          execution?.status === 'success' ? 'bg-green-500' :
                          execution?.status === 'failed' ? 'bg-red-500' :
                          execution?.status === 'running' ? 'bg-blue-500 animate-pulse' :
                          server.status === 'CONNECTED' ? 'bg-green-500' : 'bg-gray-400'
                        }`}></div>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Selection Summary */}
              {selectedServers.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm font-medium text-blue-900">
                    {selectedServers.length} server{selectedServers.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Scripts will execute simultaneously with real-time streaming output
                  </div>
                </div>
              )}

              {/* Real-time Status */}
              {isRunning && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center text-sm font-medium text-green-900">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Streaming output in real-time...
                  </div>
                  <div className="text-xs text-green-700 mt-1">
                    Watch the results panel for live updates
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