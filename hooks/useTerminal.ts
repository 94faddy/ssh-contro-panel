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
  
  // Streaming
  isStreaming: boolean;
  
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
  const [isStreaming, setIsStreaming] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef<TerminalConfig>({ ...defaultConfig, ...config });
  const streamingBufferRef = useRef<string>('');
  const streamingOutputIdRef = useRef<string | null>(null);
  
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

  const updateStreamingOutput = useCallback((content: string, type: TerminalOutputLine['type'] = 'output') => {
    if (streamingOutputIdRef.current) {
      setState(prev => ({
        ...prev,
        outputs: prev.outputs.map(output => 
          output.id === streamingOutputIdRef.current
            ? { ...output, content, type }
            : output
        )
      }));
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

    const wsUrl = getWebSocketUrl();
    console.log('Connecting to WebSocket:', wsUrl);

    const newSocket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setSocket(newSocket);
      newSocket.emit('terminal:connect', { serverId });
    });

    newSocket.on('disconnect', () => {
      setState(prev => ({
        ...prev,
        isConnected: false,
        sessionId: null,
        isCommandRunning: false
      }));
      setIsStreaming(false);
      addOutput('system', 'Connection lost');
      onDisconnect?.();
    });

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

    // Handle command started - prepare for streaming
    newSocket.on('terminal:command-started', (data: {
      sessionId: string;
      command: string;
      timestamp: string;
    }) => {
      setIsStreaming(true);
      streamingBufferRef.current = '';
      
      // Create streaming output placeholder
      const streamId = `stream-${Date.now()}`;
      streamingOutputIdRef.current = streamId;
      
      setState(prev => ({
        ...prev,
        outputs: [
          ...prev.outputs,
          {
            id: streamId,
            type: 'output',
            content: '',
            timestamp: new Date(),
            copyable: true
          }
        ]
      }));
    });

    // Handle streaming output - real-time data
    newSocket.on('terminal:stream', (data: {
      sessionId: string;
      type: 'stdout' | 'stderr';
      data: string;
      timestamp: string;
    }) => {
      streamingBufferRef.current += data.data;
      updateStreamingOutput(
        streamingBufferRef.current,
        data.type === 'stderr' ? 'error' : 'output'
      );
    });

    // Handle command completion
    newSocket.on('terminal:output', (data: {
      sessionId: string;
      command: string;
      stdout: string;
      stderr: string;
      exitCode: number;
      currentDir: string;
      timestamp: string;
      isComplete?: boolean;
    }) => {
      if (data.isComplete) {
        setState(prev => ({
          ...prev,
          isCommandRunning: false,
          currentDirectory: data.currentDir || prev.currentDirectory
        }));
        
        setIsStreaming(false);
        streamingOutputIdRef.current = null;
        streamingBufferRef.current = '';

        // Handle clear command
        if (data.command.trim() === 'clear') {
          setState(prev => ({ ...prev, outputs: [] }));
          addOutput('system', 'Terminal cleared');
          return;
        }

        if (data.exitCode !== 0) {
          addOutput('system', `Command exited with code: ${data.exitCode}`);
        }
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
      setIsStreaming(false);
      streamingOutputIdRef.current = null;
      streamingBufferRef.current = '';
      onError?.(data.error);
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      addOutput('error', `Failed to connect to terminal server: ${error.message}`);
      setState(prev => ({ ...prev, isConnecting: false }));
      onError?.('Connection failed');
    });
  }, [serverId, state.isConnecting, state.isConnected, addOutput, updateStreamingOutput, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
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
    setIsStreaming(false);
  }, [socket, state.sessionId]);

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
    const trimmedCommand = command.trim();
    
    if (!trimmedCommand) {
      return { allowed: false, dangerous: false, requiresConfirmation: false };
    }

    const dangerousPatterns = [
      /rm\s+-rf\s+\/\s*$/,
      /rm\s+-rf\s+\*\s*$/,
      /mkfs/,
      /dd\s+if=\/dev\/zero/,
      /:\(\)\{\s*:\|\:&\s*\};\:/
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
    isStreaming,
    terminalRef,
    inputRef
  };
}