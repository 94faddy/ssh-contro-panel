'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2, RotateCcw, Copy } from 'lucide-react';
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
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connectToServer();
    return () => {
      if (socket) {
        socket.disconnect();
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

  const connectToServer = () => {
    setIsConnecting(true);
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
      addOutput('system', 'Authentication token not found', 'error');
      setIsConnecting(false);
      return;
    }

    // Connect to WebSocket server
    const newSocket = io(`${window.location.protocol}//${window.location.hostname}:3001`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setSocket(newSocket);
      
      // Request terminal connection
      newSocket.emit('terminal:connect', { serverId });
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setSessionId(null);
      setIsCommandRunning(false);
      addOutput('system', 'Connection lost', 'error');
    });

    newSocket.on('terminal:connected', (data: { 
      sessionId: string; 
      serverName: string; 
      serverId: number;
      currentDir?: string;
    }) => {
      setSessionId(data.sessionId);
      setIsConnected(true);
      setIsConnecting(false);
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
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      addOutput('error', 'Failed to connect to terminal server', 'error');
      setIsConnecting(false);
    });
  };

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
            {isConnected && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                Connected
              </span>
            )}
            {isConnecting && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                Connecting...
              </span>
            )}
            {isCommandRunning && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                Running...
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
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
              <div className="text-red-400 mb-4">Connection failed</div>
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
        </div>
      )}
    </div>
  );
}