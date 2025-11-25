import { parseCommand, isDangerousCommand, validateCommand } from './terminal-utils';

export interface CommandValidationResult {
  allowed: boolean;
  warning?: string;
  suggestion?: string;
  requiresConfirmation?: boolean;
}

export interface CommandMiddlewareOptions {
  allowDangerousCommands?: boolean;
  requireSudoConfirmation?: boolean;
  enableCommandLogging?: boolean;
  maxCommandLength?: number;
  blockedCommands?: string[];
  allowedCommands?: string[];
}

const DEFAULT_OPTIONS: CommandMiddlewareOptions = {
  allowDangerousCommands: true,
  requireSudoConfirmation: true,
  enableCommandLogging: true,
  maxCommandLength: 1000,
  blockedCommands: [],
  allowedCommands: []
};

// Completely blocked commands (never allow)
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf .*',
  'mkfs',
  'dd if=/dev/zero of=/dev/',
  'format',
  ':(){ :|:& };:', // Fork bomb
  'chmod 777 /',
  'chown root:root /',
  'passwd root'
];

// Commands that require special handling
const INTERACTIVE_COMMANDS = [
  'vi', 'vim', 'nano', 'emacs',
  'less', 'more', 'man',
  'top', 'htop', 'iotop',
  'mysql', 'psql', 'mongo',
  'python', 'node', 'irb',
  'ssh', 'telnet', 'ftp'
];

// Commands that might hang or run indefinitely
const LONG_RUNNING_COMMANDS = [
  'tail -f',
  'watch',
  'ping',
  'traceroute',
  'nc -l',
  'netcat -l',
  'sleep'
];

export class CommandValidator {
  private options: CommandMiddlewareOptions;

  constructor(options: Partial<CommandMiddlewareOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // Main validation method
  validate(command: string, userId: number, serverId: number): CommandValidationResult {
    const trimmedCommand = command.trim();

    // Basic validations
    if (!trimmedCommand) {
      return { allowed: false, warning: 'Empty command' };
    }

    if (trimmedCommand.length > (this.options.maxCommandLength || 1000)) {
      return { allowed: false, warning: 'Command too long' };
    }

    // Check for blocked commands
    if (this.isBlockedCommand(trimmedCommand)) {
      return { 
        allowed: false, 
        warning: 'This command is blocked for security reasons' 
      };
    }

    // Check allowed commands list (if specified)
    if (this.options.allowedCommands && this.options.allowedCommands.length > 0) {
      const { baseCommand } = parseCommand(trimmedCommand);
      if (!this.options.allowedCommands.includes(baseCommand)) {
        return { 
          allowed: false, 
          warning: `Command '${baseCommand}' is not in the allowed commands list` 
        };
      }
    }

    // Check for dangerous commands
    if (isDangerousCommand(trimmedCommand)) {
      if (!this.options.allowDangerousCommands) {
        return { 
          allowed: false, 
          warning: 'Dangerous commands are not allowed' 
        };
      }
      
      return {
        allowed: true,
        warning: '⚠️ This command is potentially dangerous!',
        requiresConfirmation: true
      };
    }

    // Check for sudo commands
    if (trimmedCommand.startsWith('sudo ')) {
      if (this.options.requireSudoConfirmation) {
        return {
          allowed: true,
          warning: '🔐 This command requires administrator privileges',
          requiresConfirmation: true
        };
      }
    }

    // Check for interactive commands
    if (this.isInteractiveCommand(trimmedCommand)) {
      return {
        allowed: true,
        warning: '📱 This is an interactive command. Use Ctrl+C to exit if needed.'
      };
    }

    // Check for long-running commands
    if (this.isLongRunningCommand(trimmedCommand)) {
      return {
        allowed: true,
        warning: '⏳ This command might run for a long time. Use Ctrl+C to stop it.'
      };
    }

    // Allow all other commands by default
    return { allowed: true };
  }

  // Check if command is completely blocked
  private isBlockedCommand(command: string): boolean {
    const lowerCommand = command.toLowerCase();
    
    // Check built-in blocked commands
    if (BLOCKED_COMMANDS.some(blocked => lowerCommand.includes(blocked.toLowerCase()))) {
      return true;
    }

    // Check user-defined blocked commands
    if (this.options.blockedCommands) {
      return this.options.blockedCommands.some(blocked => 
        lowerCommand.includes(blocked.toLowerCase())
      );
    }

    return false;
  }

  // Check if command is interactive
  private isInteractiveCommand(command: string): boolean {
    const { baseCommand } = parseCommand(command);
    return INTERACTIVE_COMMANDS.includes(baseCommand.toLowerCase());
  }

  // Check if command might run for a long time
  private isLongRunningCommand(command: string): boolean {
    const lowerCommand = command.toLowerCase();
    return LONG_RUNNING_COMMANDS.some(longCmd => 
      lowerCommand.startsWith(longCmd.toLowerCase())
    );
  }

  // Log command execution
  logCommand(
    command: string, 
    userId: number, 
    serverId: number, 
    result: 'success' | 'error' | 'blocked',
    details?: any
  ): void {
    if (!this.options.enableCommandLogging) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      command,
      userId,
      serverId,
      result,
      details
    };

    console.log('Command executed:', logEntry);
    
    // In production, you might want to store this in database
    // await prisma.commandLog.create({ data: logEntry });
  }
}

// Pre-process command before sending to server
export function preprocessCommand(command: string): string {
  let processed = command.trim();

  // Handle aliases - ใช้ apt-get แทน apt เพื่อหลีกเลี่ยง warning
  const aliases: Record<string, string> = {
    'll': 'ls -la',
    'la': 'ls -la',
    'l': 'ls -CF',
    '..': 'cd ..',
    '...': 'cd ../..',
    'cd-': 'cd -',
    'h': 'history',
    'c': 'clear',
    'x': 'exit',
    
    // เพิ่ม aliases ใหม่ที่นี่ - ใช้ apt-get และ -qq flag
    'mylog': 'tail -f /var/log/myapp.log',
    'status': 'systemctl status',
    'restart': 'sudo systemctl restart',
    'start': 'sudo systemctl start',
    'stop': 'sudo systemctl stop',
    'ports': 'netstat -tulpn',
    'disk': 'df -h',
    'mem': 'free -h',
    'cpu': 'htop',
    'proc': 'ps aux | grep',
    'mydir': 'cd /var/www/html',
    'logs': 'cd /var/log',
    'config': 'cd /etc',
    'backup': 'rsync -av --progress',
    'extract': 'tar -xzf',
    'compress': 'tar -czf',
    'update': 'sudo apt-get update -qq && sudo apt-get upgrade -y -qq',
    'install': 'sudo apt-get install -y -qq',
    'search': 'apt-cache search',
    'weather': 'curl -s wttr.in',
    'myip': 'curl -s ifconfig.me',
    'speed': 'speedtest-cli',
    'gitlog': 'git log --oneline -10',
    'gitstatus': 'git status',
    'gitpull': 'git pull',
    'gitpush': 'git push',
    'dockerps': 'docker ps',
    'dockerimg': 'docker images',
    'dockerlog': 'docker logs',
    'k8s': 'kubectl',
    'pods': 'kubectl get pods',
    'services': 'kubectl get services',
    'nginx': 'sudo nginx -t && sudo systemctl reload nginx',
    'apache': 'sudo apache2ctl configtest && sudo systemctl reload apache2',
    'mysql': 'sudo mysql -u root -p',
    'redis': 'redis-cli',
    'mongo': 'mongosh'
  };

  // Split command to check only the first word
  const words = processed.split(' ');
  const firstWord = words[0];
  
  // Replace aliases
  if (aliases[firstWord]) {
    words[0] = aliases[firstWord];
    processed = words.join(' ');
  }

  // Auto-replace apt commands with apt-get for scripts
  processed = processed.replace(/\bapt\s+update\b/g, 'apt-get update -qq');
  processed = processed.replace(/\bapt\s+upgrade\b/g, 'apt-get upgrade -y -qq');
  processed = processed.replace(/\bapt\s+install\b/g, 'apt-get install -y -qq');
  processed = processed.replace(/\bapt\s+remove\b/g, 'apt-get remove -y -qq');
  processed = processed.replace(/\bapt\s+autoremove\b/g, 'apt-get autoremove -y -qq');
  processed = processed.replace(/\bapt\s+autoclean\b/g, 'apt-get autoclean -qq');
  processed = processed.replace(/\bapt\s+clean\b/g, 'apt-get clean -qq');

  // Handle interactive commands that need special environment
  if (['vi', 'vim', 'nano', 'emacs', 'top', 'htop', 'less', 'more'].includes(firstWord)) {
    processed = `TERM=xterm-256color ${processed}`;
  }

  // Handle clear command
  if (firstWord === 'clear') {
    return 'clear'; // Let the backend handle this specially
  }

  // Add safety flags to potentially dangerous commands
  if (processed.startsWith('rm ') && !processed.includes('-i') && !processed.includes('-f')) {
    processed = processed.replace('rm ', 'rm -i ');
  }

  if (processed.startsWith('mv ') && !processed.includes('-i')) {
    processed = processed.replace('mv ', 'mv -i ');
  }

  if (processed.startsWith('cp ') && !processed.includes('-i')) {
    processed = processed.replace('cp ', 'cp -i ');
  }

  return processed;
}

// Post-process command output
export function postprocessOutput(output: string, command: string): string {
  let processed = output;

  // Remove apt warnings
  processed = processed.replace(/WARNING: apt does not have a stable CLI interface\. Use with caution in scripts\.\n?/g, '');
  
  // Truncate very long outputs
  const maxOutputLength = 50000; // 50KB
  if (processed.length > maxOutputLength) {
    processed = processed.substring(0, maxOutputLength) + '\n\n[Output truncated - too long]';
  }

  // Add helpful hints for common commands
  if (command.startsWith('ls') && !output.trim()) {
    processed += '\n(Directory is empty)';
  }

  if (command === 'pwd') {
    processed = `Current directory: ${processed}`;
  }

  // Add colors to certain outputs (if ANSI colors are supported)
  if (command.startsWith('ls ')) {
    // This would require more sophisticated ANSI color processing
    // For now, just return as-is
  }

  return processed;
}

// Create default command validator instance
export const defaultCommandValidator = new CommandValidator();

// Export convenience functions
export function validateCommandQuick(command: string): CommandValidationResult {
  return defaultCommandValidator.validate(command, 0, 0);
}

export function isCommandSafe(command: string): boolean {
  const result = validateCommandQuick(command);
  return result.allowed && !result.requiresConfirmation;
}