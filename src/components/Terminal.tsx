'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, RotateCcw, Copy, Wifi, WifiOff } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import type { TerminalProps } from '@/types';

interface TerminalOutput {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
  command?: string;
  currentDir?: string;
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

export default function Terminal({ serverId, serverName, onClose }: TerminalProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [outputs, setOutputs] = useState<TerminalOutput[]>([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentDir, setCurrentDir] = useState('/');
  const [isCommandRunning, setIsCommandRunning] = useState(false);
  const [tabCompletions, setTabCompletions] = useState<string[]>([]);
  const [showCompletions, setShowCompletions] = useState(false);
  const [completionIndex, setCompletionIndex] = useState(-1);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isCloudflareProxy, setIsCloudflareProxy] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ตรวจสอบว่าใช้ Cloudflare Proxy หรือไม่
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isProxy = hostname.includes('.cloud') || hostname.includes('cloudflare');
      setIsCloudflareProxy(isProxy);
      console.log('Terminal - Cloudflare Proxy detected:', isProxy);
    }
  }, []);

  useEffect(() => {
    connectToServer();
    return () => {
      if (socket) {
        socket.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [serverId]);

  useEffect(() => {
    // Auto scroll to bottom when new output is added
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [outputs]);

  useEffect(() => {
    // Focus input when component mounts or connects
    if (isConnected && inputRef.current && !isCommandRunning) {
      inputRef.current.focus();
    }
  }, [isConnected, isCommandRunning]);

  // Start heartbeat
  const startHeartbeat = useCallback((socket: Socket) => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat-response');
      }
    }, 25000);
  }, []);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const connectToServer = useCallback(() => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setConnectionStatus('connecting');
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
      addOutput('system', 'Authentication token not found', 'error');
      setIsConnecting(false);
      setConnectionStatus('error');
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl = getWebSocketURL();
    console.log('Terminal - Connecting to WebSocket:', wsUrl);
    console.log('Terminal - Cloudflare Proxy mode:', isCloudflareProxy);

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

    // Connection events
    newSocket.on('connect', () => {
      console.log('Terminal - Socket.IO connected with transport:', newSocket.io.engine.transport.name);
      setSocket(newSocket);
      setConnectionStatus('connected');
      setReconnectAttempts(0);
      startHeartbeat(newSocket);
      newSocket.emit('terminal:connect', { serverId });
    });

    newSocket.on('connect_error', (error) => {
      console.error('Terminal - Socket.IO connection error:', error);
      setConnectionStatus('error');
      const attempts = reconnectAttempts + 1;
      setReconnectAttempts(attempts);
      
      if (attempts >= 5) {
        addOutput('error', 'Failed to connect after multiple attempts. Please check your internet connection.');
        setIsConnecting(false);
        return;
      }
      
      addOutput('system', `Connection attempt ${attempts}/5 failed. Retrying...`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Terminal - Socket.IO disconnected:', reason);
      stopHeartbeat();
      setIsConnected(false);
      setSessionId(null);
      setIsCommandRunning(false);
      setConnectionStatus('disconnected');
      addOutput('system', `Connection lost: ${reason}`);

      // Auto-reconnect only for network issues
      if (reason === 'io server disconnect' || reason === 'ping timeout' || reason === 'transport close') {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (reconnectAttempts < 3) {
            addOutput('system', 'Attempting to reconnect...');
            connectToServer();
          }
        }, 2000 + (reconnectAttempts * 1000));
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Terminal - Socket.IO reconnected after', attemptNumber, 'attempts');
      addOutput('system', 'Reconnected successfully');
      setReconnectAttempts(0);
      setConnectionStatus('connected');
    });

    // Heartbeat handler
    newSocket.on('heartbeat', () => {
      newSocket.emit('heartbeat-response');
    });

    // Transport upgrade events
    newSocket.io.engine.on('upgrade', () => {
      console.log('Terminal - Upgraded to transport:', newSocket.io.engine.transport.name);
    });

    newSocket.io.engine.on('upgradeError', (error) => {
      console.log('Terminal - Upgrade error:', error);
    });

    // Terminal events
    newSocket.on('terminal:connected', (data: { 
      sessionId: string; 
      serverName: string; 
      serverId: number;
      currentDir?: string;
    }) => {
      setSessionId(data.sessionId);
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionStatus('connected');
      setCurrentDir(data.currentDir || '/');
      addOutput('system', `Connected to ${data.serverName}`, 'system');
      addOutput('system', 'Welcome to SSH Terminal! Type your commands below.', 'system');
      addOutput('system', `Working directory: ${data.currentDir || '/'}`, 'system');
    });

    newSocket.on('terminal:output', (data: {
      sessionId: string;
      command: string;
      stdout: string;
      stderr: string;
      exitCode: number;
      currentDir: string;
      timestamp: string;
    }) => {
      setIsCommandRunning(false);
      
      if (data.currentDir) {
        setCurrentDir(data.currentDir);
      }

      // Handle clear command
      if (data.command.trim() === 'clear' || data.stdout.includes('\x1b[2J\x1b[H')) {
        setOutputs([]);
        addOutput('system', `Terminal cleared`, 'system');
        return;
      }

      if (data.stdout) {
        addOutput('output', data.stdout, 'output');
      }
      if (data.stderr) {
        addOutput('error', data.stderr, 'error');
      }
      
      // Show exit code if non-zero
      if (data.exitCode !== 0) {
        addOutput('system', `Command exited with code: ${data.exitCode}`, 'error');
      }
      
      // Add command prompt for next command
      setTimeout(() => {
        const prompt = getPrompt();
        addOutput('system', prompt, 'input', false);
      }, 100);
    });

    newSocket.on('terminal:tab-complete-result', (data: {
      sessionId: string;
      partial: string;
      completions: string[];
    }) => {
      if (data.completions.length > 0) {
        setTabCompletions(data.completions);
        setShowCompletions(true);
        setCompletionIndex(-1);
      } else {
        setShowCompletions(false);
      }
    });

    newSocket.on('terminal:error', (data: { error: string; details?: string }) => {
      addOutput('error', `Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`, 'error');
      setIsConnecting(false);
      setIsCommandRunning(false);
      setConnectionStatus('error');
    });
  }, [serverId, isConnecting, isConnected, isCloudflareProxy, reconnectAttempts, startHeartbeat, stopHeartbeat]);

  const addOutput = (type: TerminalOutput['type'], content: string, displayType: string = type, newLine: boolean = true) => {
    const output: TerminalOutput = {
      id: Date.now().toString() + Math.random(),
      type,
      content: newLine ? content : content,
      timestamp: new Date(),
      currentDir
    };
    
    setOutputs(prev => [...prev, output]);
  };

  const getPrompt = () => {
    const shortDir = currentDir.length > 20 ? '...' + currentDir.slice(-17) : currentDir;
    return `${serverName}:${shortDir}$ `;
  };

  const executeCommand = () => {
    if (!currentCommand.trim() || !socket || !sessionId || isCommandRunning) return;

    setIsCommandRunning(true);
    setShowCompletions(false);

    // Add command to history
    if (currentCommand.trim() !== commandHistory[commandHistory.length - 1]) {
      setCommandHistory(prev => [...prev, currentCommand.trim()]);
    }
    setHistoryIndex(-1);

    // Display command in terminal
    const prompt = getPrompt();
    addOutput('input', `${prompt}${currentCommand}`, 'input');

    // Clear completions
    setTabCompletions([]);

    // Send command to server
    socket.emit('terminal:command', {
      sessionId,
      command: currentCommand.trim()
    });

    setCurrentCommand('');
  };

  const handleTabCompletion = () => {
    if (!socket || !sessionId || isCommandRunning) return;

    const words = currentCommand.split(' ');
    const lastWord = words[words.length - 1] || '';
    
    if (lastWord.length > 0) {
      socket.emit('terminal:tab-complete', {
        sessionId,
        partial: lastWord,
        currentDir
      });
    }
  };

  const applyCompletion = (completion: string) => {
    const words = currentCommand.split(' ');
    const lastWord = words[words.length - 1] || '';
    
    if (lastWord.length > 0) {
      words[words.length - 1] = completion;
    } else {
      words.push(completion);
    }
    
    setCurrentCommand(words.join(' '));
    setShowCompletions(false);
    
    // Focus back to input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isCommandRunning && e.key !== 'c' && !e.ctrlKey) {
      return;
    }

    // Handle tab completions navigation
    if (showCompletions && tabCompletions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCompletionIndex(prev => (prev + 1) % tabCompletions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCompletionIndex(prev => prev <= 0 ? tabCompletions.length - 1 : prev - 1);
        return;
      } else if (e.key === 'Enter' && completionIndex >= 0) {
        e.preventDefault();
        applyCompletion(tabCompletions[completionIndex]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCompletions(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < 0 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCurrentCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTabCompletion();
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (isCommandRunning) {
        // Send interrupt signal
        if (socket && sessionId) {
          socket.emit('terminal:command', {
            sessionId,
            command: '\x03' // Ctrl+C character
          });
        }
      }
    } else {
      // Hide completions when typing
      if (showCompletions && e.key !== 'Tab') {
        setShowCompletions(false);
      }
    }
  };

  const clearTerminal = () => {
    setOutputs([]);
    addOutput('system', `Connected to ${serverName}`, 'system');
    addOutput('system', 'Terminal cleared', 'system');
    addOutput('system', `Working directory: ${currentDir}`, 'system');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      addOutput('system', 'Copied to clipboard', 'system');
    }).catch(() => {
      addOutput('system', 'Failed to copy to clipboard', 'error');
    });
  };

  const reconnect = () => {
    if (socket) {
      socket.disconnect();
    }
    setOutputs([]);
    setIsCommandRunning(false);
    setReconnectAttempts(0);
    connectToServer();
  };

  const formatOutput = (output: TerminalOutput) => {
    const timestamp = output.timestamp.toLocaleTimeString();
    
    switch (output.type) {
      case 'input':
        return (
          <div key={output.id} className="text-green-400 font-mono flex items-center group">
            <span className="select-none">{output.content}</span>
            <button
              onClick={() => copyToClipboard(output.content)}
              className="ml-2 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
              title="Copy command"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );
      case 'output':
        return (
          <div key={output.id} className="text-gray-100 font-mono whitespace-pre-wrap break-words group relative">
            {output.content}
            <button
              onClick={() => copyToClipboard(output.content)}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
              title="Copy output"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );
      case 'error':
        return (
          <div key={output.id} className="text-red-400 font-mono whitespace-pre-wrap break-words group relative">
            {output.content}
            <button
              onClick={() => copyToClipboard(output.content)}
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
              title="Copy error"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );
      case 'system':
        return (
          <div key={output.id} className="text-blue-400 font-mono italic">
            [{timestamp}] {output.content}
          </div>
        );
      default:
        return (
          <div key={output.id} className="text-gray-300 font-mono">
            {output.content}
          </div>
        );
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>;
      case 'error':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className={`bg-white shadow-xl rounded-lg overflow-hidden ${isMaximized ? 'fixed inset-4 z-50' : 'relative'} transition-all duration-200`}>
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div className="text-white font-medium">
            Terminal - {serverName}
            <div className="flex items-center space-x-2 mt-1">
              {getConnectionIcon()}
              <span className={`text-xs ${
                connectionStatus === 'connected' ? 'text-green-400' :
                connectionStatus === 'connecting' ? 'text-yellow-400' :
                connectionStatus === 'error' ? 'text-red-400' :
                'text-gray-400'
              }`}>
                {getConnectionText()}
              </span>
              {isCloudflareProxy && (
                <span className="text-xs text-blue-400 bg-blue-900 px-2 py-0.5 rounded">
                  CF Proxy
                </span>
              )}
              {reconnectAttempts > 0 && (
                <span className="text-xs text-yellow-400">
                  Retry: {reconnectAttempts}/5
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {connectionStatus === 'error' && (
            <button
              onClick={reconnect}
              className="p-1 text-gray-400 hover:text-white rounded"
              title="Reconnect"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={clearTerminal}
            className="p-1 text-gray-400 hover:text-white rounded"
            title="Clear terminal"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 text-gray-400 hover:text-white rounded"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded"
            title="Close terminal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="bg-gray-900 h-96 flex flex-col relative">
        {/* Output Area */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar"
        >
          {isConnecting && (
            <div className="text-yellow-400 font-mono">
              Connecting to {serverName}...
            </div>
          )}
          
          {outputs.map(output => formatOutput(output))}
          
          {!isConnected && !isConnecting && (
            <div className="text-center py-8">
              <div className="text-red-400 mb-4">
                {connectionStatus === 'error' ? 'Connection failed' : 'Disconnected'}
              </div>
              <button
                onClick={reconnect}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Reconnect
              </button>
            </div>
          )}
        </div>

        {/* Tab Completions */}
        {showCompletions && tabCompletions.length > 0 && (
          <div 
            ref={completionRef}
            className="absolute bottom-16 left-4 right-4 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-32 overflow-y-auto z-10"
          >
            {tabCompletions.map((completion, index) => (
              <div
                key={completion}
                className={`px-3 py-1 font-mono text-sm cursor-pointer ${
                  index === completionIndex 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
                onClick={() => applyCompletion(completion)}
              >
                {completion}
              </div>
            ))}
          </div>
        )}

        {/* Input Area */}
        {isConnected && (
          <div className="border-t border-gray-700 p-4">
            <div className="flex items-center space-x-2">
              <span className="text-green-400 font-mono font-bold select-none">
                {getPrompt()}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-green-400 font-mono outline-none"
                placeholder={isCommandRunning ? "Command is running..." : "Type your command here..."}
                disabled={isCommandRunning}
                autoComplete="off"
                spellCheck="false"
              />
              {isCommandRunning && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {isConnected && (
        <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 border-t border-gray-700">
          Session: {sessionId} | Working Dir: {currentDir} | 
          Use ↑↓ arrows for command history | Tab for completion | Ctrl+C to interrupt
          {isCloudflareProxy && ' | Running via Cloudflare Proxy'}
        </div>
      )}
    </div>
  );
}