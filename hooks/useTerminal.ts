// hooks/useTerminal.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { 
  TerminalState, 
  TerminalOutputLine, 
  CommandValidation,
  TerminalConfig 
} from '@/types';

export interface UseTerminalOptions {
  serverId: number;
  serverName: string;
  config?: Partial<TerminalConfig>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export interface UseTerminalReturn {
  // State
  state: TerminalState;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  executeCommand: (command: string) => void;
  clearTerminal: () => void;
  
  // Input handling
  currentCommand: string;
  setCurrentCommand: (command: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  
  // History
  navigateHistory: (direction: 'up' | 'down') => void;
  
  // Tab completion
  requestTabCompletion: () => void;
  tabCompletions: string[];
  showCompletions: boolean;
  applyCompletion: (completion: string) => void;
  
  // Utilities
  copyToClipboard: (text: string) => void;
  validateCommand: (command: string) => CommandValidation;
  
  // Refs
  terminalRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
}

const defaultConfig: TerminalConfig = {
  fontSize: 14,
  fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
  theme: 'dark',
  cursorBlink: true,
  scrollback: 1000,
  bellSound: false,
  tabCompletion: true,
  commandHistory: true,
  copyOnSelect: false,
  pasteWithMiddleClick: false
};

// ฟังก์ชันสำหรับสร้าง WebSocket URL ที่รองรับ Cloudflare Proxy
function getWebSocketURL(): string {
  if (typeof window === 'undefined') return '';
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  
  // ตรวจสอบว่าใช้ Cloudflare Proxy หรือไม่
  const isCloudflareProxy = hostname.includes('.cloud') || hostname.includes('cloudflare');
  
  if (isCloudflareProxy) {
    // สำหรับ Cloudflare Proxy ใช้ polling เป็นหลัก
    return `${window.location.protocol}//${hostname}`;
  } else {
    // สำหรับการใช้งานปกติ
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3126';
    return `${protocol}//${hostname}:${wsPort}`;
  }
}

export function useTerminal({ 
  serverId, 
  serverName, 
  config = {},
  onConnect,
  onDisconnect,
  onError 
}: UseTerminalOptions): UseTerminalReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<TerminalState>({
    isConnected: false,
    isConnecting: false,
    sessionId: null,
    currentDirectory: '/',
    commandHistory: [],
    historyIndex: -1,
    currentCommand: '',
    isCommandRunning: false,
    outputs: []
  });
  
  const [currentCommand, setCurrentCommand] = useState('');
  const [tabCompletions, setTabCompletions] = useState<string[]>([]);
  const [showCompletions, setShowCompletions] = useState(false);
  const [completionIndex, setCompletionIndex] = useState(-1);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isCloudflareProxy, setIsCloudflareProxy] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef<TerminalConfig>({ ...defaultConfig, ...config });
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ตรวจสอบว่าใช้ Cloudflare Proxy หรือไม่
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isProxy = hostname.includes('.cloud') || hostname.includes('cloudflare');
      setIsCloudflareProxy(isProxy);
      console.log('Cloudflare Proxy detected:', isProxy);
    }
  }, []);
  
  // Update config when it changes
  useEffect(() => {
    configRef.current = { ...defaultConfig, ...config };
  }, [config]);

  // Auto-scroll to bottom when new output is added
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [state.outputs]);

  // Focus input when connected and not running command
  useEffect(() => {
    if (state.isConnected && !state.isCommandRunning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.isConnected, state.isCommandRunning]);

  const addOutput = useCallback((
    type: TerminalOutputLine['type'], 
    content: string, 
    options: Partial<TerminalOutputLine> = {}
  ) => {
    const output: TerminalOutputLine = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      content,
      timestamp: new Date(),
      copyable: true,
      ...options
    };
    
    setState(prev => ({
      ...prev,
      outputs: [
        ...prev.outputs.slice(-(configRef.current.scrollback - 1)),
        output
      ]
    }));
  }, []);

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

  const connect = useCallback(() => {
    if (state.isConnecting || state.isConnected) return;
    
    setState(prev => ({ ...prev, isConnecting: true }));
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
      addOutput('error', 'Authentication token not found');
      setState(prev => ({ ...prev, isConnecting: false }));
      onError?.('Authentication token not found');
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl = getWebSocketURL();
    console.log('Connecting to WebSocket:', wsUrl);
    console.log('Cloudflare Proxy mode:', isCloudflareProxy);

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
      console.log('Socket.IO connected with transport:', newSocket.io.engine.transport.name);
      setSocket(newSocket);
      setReconnectAttempts(0);
      startHeartbeat(newSocket);
      newSocket.emit('terminal:connect', { serverId });
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      const attempts = reconnectAttempts + 1;
      setReconnectAttempts(attempts);
      
      if (attempts >= 5) {
        addOutput('error', 'Failed to connect after multiple attempts. Please check your internet connection.');
        setState(prev => ({ ...prev, isConnecting: false }));
        onError?.('Connection failed');
        return;
      }
      
      addOutput('system', `Connection attempt ${attempts}/5 failed. Retrying...`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      stopHeartbeat();
      setState(prev => ({
        ...prev,
        isConnected: false,
        sessionId: null,
        isCommandRunning: false
      }));
      addOutput('system', `Connection lost: ${reason}`);
      onDisconnect?.();

      // Auto-reconnect only for network issues
      if (reason === 'io server disconnect' || reason === 'ping timeout' || reason === 'transport close') {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (reconnectAttempts < 3) {
            addOutput('system', 'Attempting to reconnect...');
            connect();
          }
        }, 2000 + (reconnectAttempts * 1000));
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
      addOutput('system', 'Reconnected successfully');
      setReconnectAttempts(0);
    });

    // Heartbeat handler
    newSocket.on('heartbeat', () => {
      newSocket.emit('heartbeat-response');
    });

    // Terminal events
    newSocket.on('terminal:connected', (data: { 
      sessionId: string; 
      serverName: string; 
      serverId: number;
      currentDir?: string;
    }) => {
      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        sessionId: data.sessionId,
        currentDirectory: data.currentDir || '/'
      }));
      
      addOutput('system', `Connected to ${data.serverName}`);
      addOutput('system', 'Enhanced SSH Terminal ready! Type your commands below.');
      addOutput('system', `Working directory: ${data.currentDir || '/'}`);
      
      onConnect?.();
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
      setState(prev => ({
        ...prev,
        isCommandRunning: false,
        currentDirectory: data.currentDir || prev.currentDirectory
      }));

      if (data.stdout) {
        addOutput('output', data.stdout);
      }
      if (data.stderr) {
        addOutput('error', data.stderr);
      }
      
      if (data.exitCode !== 0) {
        addOutput('system', `Command exited with code: ${data.exitCode}`);
      }
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
      addOutput('error', `Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
      setState(prev => ({ 
        ...prev, 
        isConnecting: false, 
        isCommandRunning: false 
      }));
      onError?.(data.error);
    });

    // Transport upgrade events
    newSocket.io.engine.on('upgrade', () => {
      console.log('Upgraded to transport:', newSocket.io.engine.transport.name);
    });

    newSocket.io.engine.on('upgradeError', (error) => {
      console.log('Upgrade error:', error);
    });

  }, [serverId, state.isConnecting, state.isConnected, addOutput, onConnect, onDisconnect, onError, isCloudflareProxy, reconnectAttempts, startHeartbeat, stopHeartbeat]);

  const disconnect = useCallback(() => {
    // Clear timeouts and intervals
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    stopHeartbeat();

    if (socket) {
      if (state.sessionId) {
        socket.emit('terminal:disconnect', { sessionId: state.sessionId });
      }
      socket.disconnect();
      setSocket(null);
    }
    
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      sessionId: null,
      isCommandRunning: false
    }));

    setReconnectAttempts(0);
  }, [socket, state.sessionId, stopHeartbeat]);

  const executeCommand = useCallback((command: string) => {
    if (!command.trim() || !socket || !state.sessionId || state.isCommandRunning) return;

    setState(prev => ({ 
      ...prev, 
      isCommandRunning: true,
      commandHistory: command.trim() !== prev.commandHistory[prev.commandHistory.length - 1] 
        ? [...prev.commandHistory, command.trim()]
        : prev.commandHistory,
      historyIndex: -1
    }));

    setShowCompletions(false);
    setTabCompletions([]);

    // Add command to output
    const prompt = getPrompt();
    addOutput('input', `${prompt}${command}`);

    // Send command to server
    socket.emit('terminal:command', {
      sessionId: state.sessionId,
      command: command.trim()
    });

    setCurrentCommand('');
  }, [socket, state.sessionId, state.isCommandRunning, addOutput]);

  const clearTerminal = useCallback(() => {
    setState(prev => ({ ...prev, outputs: [] }));
    addOutput('system', `Connected to ${serverName}`);
    addOutput('system', 'Terminal cleared');
    addOutput('system', `Working directory: ${state.currentDirectory}`);
  }, [serverName, state.currentDirectory, addOutput]);

  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    if (!configRef.current.commandHistory) return;
    
    setState(prev => {
      if (prev.commandHistory.length === 0) return prev;
      
      let newIndex = prev.historyIndex;
      
      if (direction === 'up') {
        newIndex = prev.historyIndex < 0 
          ? prev.commandHistory.length - 1 
          : Math.max(0, prev.historyIndex - 1);
      } else {
        newIndex = prev.historyIndex + 1;
        if (newIndex >= prev.commandHistory.length) {
          newIndex = -1;
          setCurrentCommand('');
          return { ...prev, historyIndex: newIndex };
        }
      }
      
      setCurrentCommand(prev.commandHistory[newIndex]);
      return { ...prev, historyIndex: newIndex };
    });
  }, []);

  const requestTabCompletion = useCallback(() => {
    if (!configRef.current.tabCompletion || !socket || !state.sessionId || state.isCommandRunning) return;

    const words = currentCommand.split(' ');
    const lastWord = words[words.length - 1] || '';
    
    if (lastWord.length > 0) {
      socket.emit('terminal:tab-complete', {
        sessionId: state.sessionId,
        partial: lastWord,
        currentDir: state.currentDirectory
      });
    }
  }, [socket, state.sessionId, state.isCommandRunning, state.currentDirectory, currentCommand]);

  const applyCompletion = useCallback((completion: string) => {
    const words = currentCommand.split(' ');
    const lastWord = words[words.length - 1] || '';
    
    if (lastWord.length > 0) {
      words[words.length - 1] = completion;
    } else {
      words.push(completion);
    }
    
    setCurrentCommand(words.join(' '));
    setShowCompletions(false);
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentCommand]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (state.isCommandRunning && e.key !== 'c' && !e.ctrlKey) {
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

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        executeCommand(currentCommand);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        navigateHistory('up');
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        navigateHistory('down');
        break;
        
      case 'Tab':
        e.preventDefault();
        requestTabCompletion();
        break;
        
      case 'c':
        if (e.ctrlKey) {
          e.preventDefault();
          if (state.isCommandRunning && socket && state.sessionId) {
            socket.emit('terminal:command', {
              sessionId: state.sessionId,
              command: '\x03' // Ctrl+C character
            });
          }
        }
        break;
        
      default:
        if (showCompletions && e.key !== 'Tab') {
          setShowCompletions(false);
        }
        break;
    }
  }, [
    state.isCommandRunning, 
    showCompletions, 
    tabCompletions, 
    completionIndex,
    currentCommand,
    executeCommand,
    navigateHistory,
    requestTabCompletion,
    applyCompletion,
    socket,
    state.sessionId
  ]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addOutput('system', 'Copied to clipboard');
    } catch (error) {
      addOutput('system', 'Failed to copy to clipboard');
    }
  }, [addOutput]);

  const validateCommand = useCallback((command: string): CommandValidation => {
    // Basic validation - can be extended with more sophisticated logic
    const trimmedCommand = command.trim();
    
    if (!trimmedCommand) {
      return { allowed: false, dangerous: false, requiresConfirmation: false };
    }

    // Check for dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf\s+\/\s*$/,
      /rm\s+-rf\s+\*\s*$/,
      /mkfs/,
      /dd\s+if=\/dev\/zero/,
      /:\(\)\{\s*:\|\:&\s*\};\:/  // fork bomb
    ];

    const isDangerous = dangerousPatterns.some(pattern => pattern.test(trimmedCommand));
    
    if (isDangerous) {
      return {
        allowed: false,
        dangerous: true,
        requiresConfirmation: true,
        warning: '⚠️ This command is extremely dangerous and could damage your system!'
      };
    }

    // Check for sudo commands
    if (trimmedCommand.startsWith('sudo ')) {
      return {
        allowed: true,
        dangerous: false,
        requiresConfirmation: true,
        warning: '🔐 This command requires administrator privileges'
      };
    }

    return { allowed: true, dangerous: false, requiresConfirmation: false };
  }, []);

  const getPrompt = useCallback(() => {
    const shortDir = state.currentDirectory.length > 20 
      ? '...' + state.currentDirectory.slice(-17) 
      : state.currentDirectory;
    return `${serverName}:${shortDir}$ `;
  }, [serverName, state.currentDirectory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    connect,
    disconnect,
    executeCommand,
    clearTerminal,
    currentCommand,
    setCurrentCommand,
    handleKeyDown,
    navigateHistory,
    requestTabCompletion,
    tabCompletions,
    showCompletions,
    applyCompletion,
    copyToClipboard,
    validateCommand,
    terminalRef,
    inputRef
  };
}