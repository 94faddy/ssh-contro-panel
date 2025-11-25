'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface MiniTerminalRef {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  scrollToBottom: () => void;
}

interface MiniTerminalProps {
  height?: number;
  fontSize?: number;
  onReady?: () => void;
}

const MiniTerminal = forwardRef<MiniTerminalRef, MiniTerminalProps>(({ 
  height = 192, 
  fontSize = 12,
  onReady 
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const isInitializedRef = useRef(false);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    },
    writeln: (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.writeln(data);
      }
    },
    clear: () => {
      if (xtermRef.current) {
        xtermRef.current.clear();
      }
    },
    scrollToBottom: () => {
      if (xtermRef.current) {
        xtermRef.current.scrollToBottom();
      }
    }
  }), []);

  // Initialize xterm
  useEffect(() => {
    if (isInitializedRef.current || !containerRef.current) {
      return;
    }
    
    isInitializedRef.current = true;
    
    let terminal: any = null;
    let fitAddon: any = null;
    let resizeObserver: ResizeObserver | null = null;
    let isCleanedUp = false;

    const initXterm = async () => {
      try {
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');
        
        await import('xterm/css/xterm.css');

        if (isCleanedUp || !containerRef.current) {
          return;
        }

        terminal = new Terminal({
          cursorBlink: false,
          cursorStyle: 'underline',
          fontSize: fontSize,
          fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
          lineHeight: 1.2,
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
          scrollback: 5000,
          convertEol: true,
          disableStdin: true, // Read-only terminal
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        terminal.open(containerRef.current);

        xtermRef.current = terminal;
        fitAddonRef.current = fitAddon;

        // Initial fit
        setTimeout(() => {
          if (!isCleanedUp && fitAddon) {
            try {
              fitAddon.fit();
            } catch (e) {
              // Ignore fit errors
            }
          }
        }, 50);

        // Set up ResizeObserver
        resizeObserver = new ResizeObserver(() => {
          if (!isCleanedUp && fitAddon) {
            setTimeout(() => {
              try {
                fitAddon.fit();
              } catch (e) {
                // Ignore fit errors
              }
            }, 10);
          }
        });
        
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }

        onReady?.();
      } catch (error) {
        console.error('Failed to initialize MiniTerminal:', error);
      }
    };

    initXterm();

    return () => {
      isCleanedUp = true;
      isInitializedRef.current = false;
      
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      
      if (terminal) {
        terminal.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [fontSize, onReady]);

  return (
    <div 
      ref={containerRef}
      className="w-full overflow-hidden"
      style={{ 
        height: `${height}px`,
        backgroundColor: '#0d1117',
        padding: '4px'
      }}
    />
  );
});

MiniTerminal.displayName = 'MiniTerminal';

export default MiniTerminal;