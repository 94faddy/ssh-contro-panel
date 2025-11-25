'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, RotateCcw, Download, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import type { TerminalProps } from '@/types';

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

export default function Terminal({ serverId, serverName, onClose }: TerminalProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentDir, setCurrentDir] = useState('~');
  const [isXtermReady, setIsXtermReady] = useState(false);
  
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalWrapperRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Fit terminal function with debounce
  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current && terminalContainerRef.current) {
      try {
        // Make sure container has dimensions before fitting
        const container = terminalContainerRef.current;
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddonRef.current.fit();
        }
      } catch (e) {
        console.error('Fit error:', e);
      }
    }
  }, []);

  // Initialize xterm.js
  useEffect(() => {
    let terminal: any = null;
    let fitAddon: any = null;
    let resizeObserver: ResizeObserver | null = null;

    const initXterm = async () => {
      // Dynamic import xterm.js
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      const { WebLinksAddon } = await import('xterm-addon-web-links');

      // Import CSS
      await import('xterm/css/xterm.css');

      if (!terminalContainerRef.current) return;

      // Create terminal with optimized settings
      terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, "Courier New", monospace',
        lineHeight: 1.2,
        letterSpacing: 0,
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: 'rgba(56, 139, 253, 0.4)',
          selectionForeground: '#ffffff',
          black: '#484f58',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#b1bac4',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#f0f6fc'
        },
        allowProposedApi: true,
        scrollback: 10000,
        convertEol: true,
        scrollOnUserInput: true,
      });

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      // Open terminal
      terminal.open(terminalContainerRef.current);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Initial fit with delay to ensure container is ready
      setTimeout(() => {
        fitAddon.fit();
        setIsXtermReady(true);
      }, 50);

      // Handle user input - send directly to server
      terminal.onData((data: string) => {
        if (socketRef.current && sessionIdRef.current) {
          socketRef.current.emit('terminal:input', {
            sessionId: sessionIdRef.current,
            data: data
          });
        }
      });

      // Handle resize
      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (socketRef.current && sessionIdRef.current) {
          socketRef.current.emit('terminal:resize', {
            sessionId: sessionIdRef.current,
            cols,
            rows
          });
        }
      });

      // Write welcome message
      terminal.writeln('\x1b[1;36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
      terminal.writeln('\x1b[1;36m║\x1b[0m             \x1b[1;32mSSH Control Panel - Terminal\x1b[0m                   \x1b[1;36m║\x1b[0m');
      terminal.writeln('\x1b[1;36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
      terminal.writeln('');
      terminal.writeln('\x1b[33mConnecting to server...\x1b[0m');
      terminal.write('\x1b[?25l'); // Hide cursor while connecting

      // Set up ResizeObserver for container
      resizeObserver = new ResizeObserver(() => {
        setTimeout(() => fitAddon.fit(), 10);
      });
      
      if (terminalWrapperRef.current) {
        resizeObserver.observe(terminalWrapperRef.current);
      }

      // Connect to WebSocket after xterm is ready
      connectToServer();
    };

    initXterm();

    // Handle window resize
    const handleResize = () => {
      setTimeout(fitTerminal, 50);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (terminal) {
        terminal.dispose();
      }
      if (socketRef.current) {
        if (sessionIdRef.current) {
          socketRef.current.emit('terminal:disconnect', { sessionId: sessionIdRef.current });
        }
        socketRef.current.disconnect();
      }
    };
  }, [serverId]);

  // Fit terminal when maximized state changes
  useEffect(() => {
    if (isXtermReady) {
      setTimeout(fitTerminal, 100);
    }
  }, [isMaximized, isXtermReady, fitTerminal]);

  const connectToServer = useCallback(() => {
    setIsConnecting(true);
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
      if (xtermRef.current) {
        xtermRef.current.writeln('\x1b[31mError: Authentication token not found\x1b[0m');
        xtermRef.current.write('\x1b[?25h'); // Show cursor
      }
      setIsConnecting(false);
      return;
    }

    const wsUrl = getWebSocketUrl();
    console.log('Terminal connecting to WebSocket:', wsUrl);

    const newSocket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      socketRef.current = newSocket;
      setSocket(newSocket);
      
      // Get terminal dimensions
      const cols = xtermRef.current?.cols || 120;
      const rows = xtermRef.current?.rows || 30;
      
      // Request PTY terminal connection
      newSocket.emit('terminal:connect', { 
        serverId,
        cols,
        rows
      });
    });

    newSocket.on('terminal:connected', (data: { sessionId: string; serverName: string; currentDir: string }) => {
      console.log('Terminal connected:', data);
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setCurrentDir(data.currentDir || '~');
      setIsConnected(true);
      setIsConnecting(false);
      
      if (xtermRef.current) {
        xtermRef.current.writeln('');
        xtermRef.current.writeln(`\x1b[1;32mConnected to ${data.serverName}\x1b[0m`);
        xtermRef.current.writeln(`\x1b[90mworking directory: ${data.currentDir}\x1b[0m`);
        xtermRef.current.writeln('');
        xtermRef.current.write('\x1b[?25h'); // Show cursor
      }
      
      // Fit after connected
      setTimeout(fitTerminal, 100);
    });

    // Handle PTY data (real terminal output)
    newSocket.on('terminal:data', (data: { sessionId: string; data: string }) => {
      if (xtermRef.current && data.data) {
        xtermRef.current.write(data.data);
      }
    });

    newSocket.on('terminal:error', (data: { error: string }) => {
      console.error('Terminal error:', data.error);
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31mError: ${data.error}\x1b[0m`);
        xtermRef.current.write('\x1b[?25h'); // Show cursor
      }
      setIsConnecting(false);
    });

    newSocket.on('terminal:closed', () => {
      console.log('Terminal session closed');
      setIsConnected(false);
      if (xtermRef.current) {
        xtermRef.current.writeln('');
        xtermRef.current.writeln('\x1b[33mSession closed by server\x1b[0m');
      }
    });

    newSocket.on('connect_error', (error: Error) => {
      console.error('Connection error:', error);
      if (xtermRef.current) {
        xtermRef.current.writeln(`\x1b[31mConnection failed: ${error.message}\x1b[0m`);
        xtermRef.current.write('\x1b[?25h'); // Show cursor
      }
      setIsConnecting(false);
    });

    newSocket.on('disconnect', (reason: string) => {
      console.log('Disconnected:', reason);
      setIsConnected(false);
      if (xtermRef.current) {
        xtermRef.current.writeln('');
        xtermRef.current.writeln(`\x1b[33mDisconnected: ${reason}\x1b[0m`);
      }
    });

  }, [serverId, fitTerminal]);

  const handleClose = useCallback(() => {
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('terminal:disconnect', { sessionId: sessionIdRef.current });
      socketRef.current.disconnect();
    }
    onClose?.();
  }, [onClose]);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln('\x1b[33mReconnecting...\x1b[0m');
    }
    connectToServer();
  }, [connectToServer]);

  const clearTerminal = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);

  const downloadLog = useCallback(() => {
    if (!xtermRef.current) return;
    
    // Get terminal buffer content
    const buffer = xtermRef.current.buffer.active;
    let content = '';
    
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        content += line.translateToString(true) + '\n';
      }
    }
    
    // Create and download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terminal-${serverName}-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [serverName]);

  return (
    <div 
      className={`flex flex-col bg-gray-900 rounded-lg overflow-hidden shadow-2xl border border-gray-700 ${
        isMaximized 
          ? 'fixed inset-4 z-50' 
          : 'w-full h-full'
      }`}
    >
      {/* Title Bar */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          {/* macOS style buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              className="w-3 h-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
              title="Close"
            />
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="w-3 h-3 bg-yellow-500 rounded-full hover:bg-yellow-600 transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            />
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          </div>
          <div className="text-white font-medium flex items-center text-sm">
            Terminal - {serverName}
            {isConnected && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400 border border-green-700">
                Connected
              </span>
            )}
            {isConnecting && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-700">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Connecting
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={downloadLog}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Download log"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={clearTerminal}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Clear terminal"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Close terminal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal Content - xterm.js container */}
      <div 
        ref={terminalWrapperRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ backgroundColor: '#0d1117' }}
      >
        <div 
          ref={terminalContainerRef}
          className="w-full h-full"
          style={{ 
            padding: '8px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Status Bar */}
      <div className="bg-gray-800 px-4 py-1.5 text-xs text-gray-400 border-t border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {isConnected ? (
              <>
                <span className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Session: {sessionId?.substring(0, 20)}...
                </span>
                <span className="text-gray-500">|</span>
                <span>Dir: {currentDir}</span>
              </>
            ) : (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Disconnected
              </span>
            )}
          </div>
          <div className="text-gray-500 space-x-3">
            <span>Ctrl+C: Interrupt</span>
            <span>Ctrl+D: EOF</span>
            <span>Ctrl+L: Clear</span>
          </div>
        </div>
      </div>

      {/* Reconnect overlay */}
      {!isConnected && !isConnecting && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-300 mb-4">Connection lost</p>
            <button
              onClick={reconnect}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}