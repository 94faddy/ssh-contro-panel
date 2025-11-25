'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Square, 
  Search, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Terminal as TerminalIcon,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
import Layout from '@/components/Layout';
import MiniTerminal, { MiniTerminalRef } from '@/components/MiniTerminal';
import { formatDuration } from '@/lib/utils';
import type { Server, ApiResponse } from '@/types';

interface ServerTerminal {
  serverId: number;
  serverName: string;
  status: 'pending' | 'connecting' | 'running' | 'success' | 'failed';
  exitCode?: number;
  startTime?: Date;
  endTime?: Date;
  isMinimized: boolean;
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
  const [isRunning, setIsRunning] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Terminal windows state
  const [terminals, setTerminals] = useState<Map<number, ServerTerminal>>(new Map());
  const [showTerminals, setShowTerminals] = useState(false);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  
  // Refs for MiniTerminal components
  const terminalRefsMap = useRef<Map<number, MiniTerminalRef>>(new Map());

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

  // Write to specific terminal
  const writeToTerminal = useCallback((serverId: number, data: string, type: 'stdout' | 'stderr' = 'stdout') => {
    const terminalRef = terminalRefsMap.current.get(serverId);
    if (terminalRef) {
      if (type === 'stderr') {
        // Write stderr in red color
        terminalRef.write(`\x1b[31m${data}\x1b[0m`);
      } else {
        terminalRef.write(data);
      }
    }
  }, []);

  // Write line to specific terminal
  const writeLineToTerminal = useCallback((serverId: number, data: string, color?: string) => {
    const terminalRef = terminalRefsMap.current.get(serverId);
    if (terminalRef) {
      if (color) {
        const colorCode = color === 'green' ? '32' : color === 'red' ? '31' : color === 'yellow' ? '33' : color === 'cyan' ? '36' : '0';
        terminalRef.writeln(`\x1b[${colorCode}m${data}\x1b[0m`);
      } else {
        terminalRef.writeln(data);
      }
    }
  }, []);

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
      setShowTerminals(true);
      
      // Initialize terminal windows for each server
      const newTerminals = new Map<number, ServerTerminal>();
      data.servers.forEach(server => {
        newTerminals.set(server.id, {
          serverId: server.id,
          serverName: server.name,
          status: 'connecting',
          isMinimized: false,
          startTime: new Date()
        });
      });
      setTerminals(newTerminals);

      // Write initial message to terminals after they're mounted
      setTimeout(() => {
        data.servers.forEach(server => {
          writeLineToTerminal(server.id, `Connecting to ${server.name}...`, 'yellow');
        });
      }, 100);
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
      // Update terminal status to running
      setTerminals(prev => {
        const newMap = new Map(prev);
        const terminal = newMap.get(data.serverId);
        if (terminal && terminal.status !== 'success' && terminal.status !== 'failed') {
          newMap.set(data.serverId, {
            ...terminal,
            status: 'running'
          });
        }
        return newMap;
      });

      // Write to xterm
      writeToTerminal(data.serverId, data.data, data.type);
    });

    // Handle progress updates
    newSocket.on('script:progress', (data: {
      executionId: string;
      serverId: number;
      serverName: string;
      status: 'running' | 'success' | 'failed';
      exitCode?: number;
      error?: string;
      isComplete?: boolean;
    }) => {
      setTerminals(prev => {
        const newMap = new Map(prev);
        const terminal = newMap.get(data.serverId);
        if (terminal) {
          newMap.set(data.serverId, {
            ...terminal,
            status: data.status,
            exitCode: data.exitCode,
            endTime: data.isComplete ? new Date() : terminal.endTime
          });
        }
        return newMap;
      });

      // Write status message to terminal
      if (data.isComplete) {
        if (data.status === 'success') {
          writeLineToTerminal(data.serverId, '', undefined);
          writeLineToTerminal(data.serverId, `✓ Command completed successfully (exit code: ${data.exitCode || 0})`, 'green');
        } else if (data.status === 'failed') {
          writeLineToTerminal(data.serverId, '', undefined);
          if (data.error) {
            writeLineToTerminal(data.serverId, `Error: ${data.error}`, 'red');
          }
          writeLineToTerminal(data.serverId, `✗ Command failed (exit code: ${data.exitCode})`, 'red');
        }
      }
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
      
      Swal.fire({
        title: 'Script Execution Complete',
        html: `
          <div class="text-left">
            <p>Executed on <strong>${data.totalServers}</strong> servers</p>
            <div class="flex justify-center space-x-8 mt-4">
              <div class="text-center">
                <div class="text-3xl font-bold text-green-600">${data.successCount}</div>
                <div class="text-sm text-gray-500">Success</div>
              </div>
              <div class="text-center">
                <div class="text-3xl font-bold text-red-600">${data.failedCount}</div>
                <div class="text-sm text-gray-500">Failed</div>
              </div>
            </div>
          </div>
        `,
        icon: data.failedCount === 0 ? 'success' : 'warning',
        confirmButtonText: 'OK'
      });
    });

    // Handle script error
    newSocket.on('script:error', (data: { error: string }) => {
      setIsRunning(false);
      setCurrentExecutionId(null);
      
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
      
      setTerminals(prev => {
        const newMap = new Map(prev);
        newMap.forEach((terminal, serverId) => {
          if (terminal.status === 'running' || terminal.status === 'connecting' || terminal.status === 'pending') {
            newMap.set(serverId, {
              ...terminal,
              status: 'failed'
            });
            writeLineToTerminal(serverId, '', undefined);
            writeLineToTerminal(serverId, '[Cancelled by user]', 'yellow');
          }
        });
        return newMap;
      });
      
      Swal.fire({
        title: 'Script Cancelled',
        text: 'Script execution was cancelled.',
        icon: 'info'
      });
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
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
          <div class="bg-gray-100 p-3 rounded mt-3 max-h-32 overflow-auto">
            <code class="text-sm whitespace-pre-wrap">${command}</code>
          </div>
          <p class="text-sm text-gray-500 mt-3">
            <strong>Note:</strong> Terminal windows will open for each server with real-time output.
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
      setTerminals(new Map());
      terminalRefsMap.current.clear();

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
    setTerminals(new Map());
    setShowTerminals(false);
    terminalRefsMap.current.clear();
  };

  const toggleTerminalMinimize = (serverId: number) => {
    setTerminals(prev => {
      const newMap = new Map(prev);
      const terminal = newMap.get(serverId);
      if (terminal) {
        newMap.set(serverId, {
          ...terminal,
          isMinimized: !terminal.isMinimized
        });
      }
      return newMap;
    });
  };

  // Register terminal ref
  const registerTerminalRef = useCallback((serverId: number, ref: MiniTerminalRef | null) => {
    if (ref) {
      terminalRefsMap.current.set(serverId, ref);
    } else {
      terminalRefsMap.current.delete(serverId);
    }
  }, []);

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         server.host.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || server.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const connectedServers = filteredServers.filter(server => server.status === 'CONNECTED');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      case 'connecting':
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'border-gray-600';
      case 'connecting':
        return 'border-yellow-600';
      case 'running':
        return 'border-blue-600';
      case 'success':
        return 'border-green-600';
      case 'failed':
        return 'border-red-600';
      default:
        return 'border-gray-600';
    }
  };

  const getTerminalGridClass = () => {
    const count = terminals.size;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 lg:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 6) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
  };

  // Calculate summary
  const terminalArray = Array.from(terminals.values());
  const completedCount = terminalArray.filter(t => t.status === 'success' || t.status === 'failed').length;
  const successCount = terminalArray.filter(t => t.status === 'success').length;
  const failedCount = terminalArray.filter(t => t.status === 'failed').length;
  const runningCount = terminalArray.filter(t => t.status === 'running' || t.status === 'connecting').length;

  return (
    <Layout>
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Script Runner</h1>
          <p className="mt-1 text-sm text-gray-500">
            Execute scripts on multiple servers with <span className="text-blue-600 font-medium">real-time terminal output</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Script Configuration */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow-soft rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <TerminalIcon className="h-5 w-5 mr-2 text-blue-600" />
                Script Configuration
              </h2>
              
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

                {/* Quick Commands */}
                <div>
                  <label className="form-label text-gray-500">Quick Commands</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: 'Update System', cmd: 'sudo apt update && sudo apt upgrade -y' },
                      { name: 'Check Disk', cmd: 'df -h' },
                      { name: 'Check Memory', cmd: 'free -h' },
                      { name: 'List Processes', cmd: 'ps aux --sort=-%mem | head -20' },
                      { name: 'Check Uptime', cmd: 'uptime' },
                    ].map((quick) => (
                      <button
                        key={quick.name}
                        onClick={() => {
                          setScriptName(quick.name);
                          setCommand(quick.cmd);
                        }}
                        disabled={isRunning}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors disabled:opacity-50"
                      >
                        {quick.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
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
                  </div>

                  <div className="text-sm text-gray-500">
                    {selectedServers.length} of {connectedServers.length} servers selected
                  </div>
                </div>
              </div>
            </div>
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

              {/* Search */}
              <div className="mb-4">
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
              </div>

              {/* Server List */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="text-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                  </div>
                ) : connectedServers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    No connected servers found
                  </div>
                ) : (
                  connectedServers.map((server) => {
                    const terminal = terminals.get(server.id);
                    
                    return (
                      <label
                        key={server.id}
                        className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all duration-150 ${
                          selectedServers.includes(server.id)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        } ${isRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedServers.includes(server.id)}
                          onChange={() => handleServerToggle(server.id)}
                          disabled={isRunning}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <div className="ml-3 flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate flex items-center">
                            {server.name}
                            {terminal && (
                              <span className="ml-2">
                                {getStatusIcon(terminal.status)}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 truncate">{server.host}</div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Selection Summary */}
              {selectedServers.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm font-medium text-blue-900">
                    {selectedServers.length} server{selectedServers.length !== 1 ? 's' : ''} selected
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Each server will show a terminal window
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terminal Windows Section - MOVED TO BOTTOM */}
        {showTerminals && terminals.size > 0 && (
          <div className="mt-6">
            {/* Terminal Summary Bar */}
            <div className="bg-gray-900 rounded-t-lg px-4 py-3 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center space-x-4">
                <TerminalIcon className="h-5 w-5 text-green-400" />
                <span className="text-white font-medium">Live Terminal Output</span>
                
                {isRunning && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-700">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Running...
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Progress Summary */}
                <div className="flex items-center space-x-3 text-sm">
                  <span className="text-gray-400">
                    Progress: {completedCount}/{terminals.size}
                  </span>
                  {successCount > 0 && (
                    <span className="text-green-400 flex items-center">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {successCount}
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="text-red-400 flex items-center">
                      <XCircle className="h-4 w-4 mr-1" />
                      {failedCount}
                    </span>
                  )}
                  {runningCount > 0 && (
                    <span className="text-blue-400 flex items-center">
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      {runningCount}
                    </span>
                  )}
                </div>

                {/* Expand/Collapse Button */}
                <button
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title={isTerminalExpanded ? 'Collapse' : 'Expand'}
                >
                  {isTerminalExpanded ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
                
                {!isRunning && (
                  <button
                    onClick={clearResults}
                    className="text-gray-400 hover:text-white transition-colors text-sm"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
            
            {/* Terminal Grid */}
            <div className={`grid ${getTerminalGridClass()} gap-0.5 bg-gray-700 rounded-b-lg overflow-hidden`}>
              {Array.from(terminals.entries()).map(([serverId, terminal]) => (
                <div 
                  key={serverId}
                  className={`flex flex-col bg-gray-800 border-l-2 ${getStatusBorderColor(terminal.status)} transition-colors duration-300`}
                >
                  {/* Terminal Header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(terminal.status)}
                      <span className="text-white font-medium text-sm truncate max-w-[150px]">
                        {terminal.serverName}
                      </span>
                      
                      {terminal.status === 'success' && (
                        <span className="text-xs text-green-400 bg-green-900/50 px-2 py-0.5 rounded">
                          Exit: 0
                        </span>
                      )}
                      {terminal.status === 'failed' && terminal.exitCode !== undefined && (
                        <span className="text-xs text-red-400 bg-red-900/50 px-2 py-0.5 rounded">
                          Exit: {terminal.exitCode}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      {terminal.startTime && terminal.endTime && (
                        <span className="text-xs text-gray-400 mr-2">
                          {formatDuration(terminal.endTime.getTime() - terminal.startTime.getTime())}
                        </span>
                      )}
                      <button
                        onClick={() => toggleTerminalMinimize(serverId)}
                        className="p-1 text-gray-400 hover:text-white rounded transition-colors"
                      >
                        {terminal.isMinimized ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {/* Terminal Content using xterm.js */}
                  {!terminal.isMinimized && (
                    <div className="flex-1 min-h-0">
                      <MiniTerminal
                        ref={(ref) => registerTerminalRef(serverId, ref)}
                        height={isTerminalExpanded ? 300 : 192}
                        fontSize={12}
                      />
                    </div>
                  )}
                  
                  {/* Minimized State */}
                  {terminal.isMinimized && (
                    <div className="px-3 py-2 text-xs text-gray-400 bg-gray-900/50">
                      {terminal.status === 'running' && 'Running...'}
                      {terminal.status === 'connecting' && 'Connecting...'}
                      {terminal.status === 'pending' && 'Pending...'}
                      {terminal.status === 'success' && '✓ Completed successfully'}
                      {terminal.status === 'failed' && `✗ Failed (exit: ${terminal.exitCode})`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}