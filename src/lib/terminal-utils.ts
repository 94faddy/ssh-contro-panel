// lib/terminal-utils.ts

export interface CommandInfo {
  command: string;
  description: string;
  examples?: string[];
  dangerous?: boolean;
}

// Common Linux commands with descriptions
export const COMMON_COMMANDS: Record<string, CommandInfo> = {
  'ls': {
    command: 'ls',
    description: 'List directory contents',
    examples: ['ls -la', 'ls -lh', 'ls *.txt']
  },
  'cd': {
    command: 'cd',
    description: 'Change directory',
    examples: ['cd /home', 'cd ..', 'cd ~']
  },
  'pwd': {
    command: 'pwd',
    description: 'Print working directory'
  },
  'mkdir': {
    command: 'mkdir',
    description: 'Create directory',
    examples: ['mkdir newdir', 'mkdir -p path/to/dir']
  },
  'rmdir': {
    command: 'rmdir',
    description: 'Remove empty directory',
    examples: ['rmdir dirname']
  },
  'rm': {
    command: 'rm',
    description: 'Remove files and directories',
    examples: ['rm file.txt', 'rm -r dirname', 'rm -f file.txt'],
    dangerous: true
  },
  'cp': {
    command: 'cp',
    description: 'Copy files or directories',
    examples: ['cp file1 file2', 'cp -r dir1 dir2']
  },
  'mv': {
    command: 'mv',
    description: 'Move/rename files or directories',
    examples: ['mv oldname newname', 'mv file /path/to/destination']
  },
  'cat': {
    command: 'cat',
    description: 'Display file contents',
    examples: ['cat file.txt', 'cat file1 file2']
  },
  'less': {
    command: 'less',
    description: 'View file contents page by page',
    examples: ['less file.txt', 'less +F logfile']
  },
  'head': {
    command: 'head',
    description: 'Display first lines of file',
    examples: ['head file.txt', 'head -n 20 file.txt']
  },
  'tail': {
    command: 'tail',
    description: 'Display last lines of file',
    examples: ['tail file.txt', 'tail -f logfile', 'tail -n 50 file.txt']
  },
  'grep': {
    command: 'grep',
    description: 'Search text patterns',
    examples: ['grep "pattern" file.txt', 'grep -r "pattern" .', 'grep -i "pattern" file.txt']
  },
  'find': {
    command: 'find',
    description: 'Search for files and directories',
    examples: ['find . -name "*.txt"', 'find /home -type f -size +100M']
  },
  'chmod': {
    command: 'chmod',
    description: 'Change file permissions',
    examples: ['chmod 755 file.txt', 'chmod +x script.sh', 'chmod -R 644 directory/']
  },
  'chown': {
    command: 'chown',
    description: 'Change file ownership',
    examples: ['chown user:group file.txt', 'chown -R user directory/']
  },
  'ps': {
    command: 'ps',
    description: 'Display running processes',
    examples: ['ps aux', 'ps -ef', 'ps -u username']
  },
  'top': {
    command: 'top',
    description: 'Display and update running processes'
  },
  'htop': {
    command: 'htop',
    description: 'Interactive process viewer'
  },
  'kill': {
    command: 'kill',
    description: 'Terminate processes',
    examples: ['kill 1234', 'kill -9 1234', 'killall process_name'],
    dangerous: true
  },
  'df': {
    command: 'df',
    description: 'Display filesystem disk usage',
    examples: ['df -h', 'df -i']
  },
  'du': {
    command: 'du',
    description: 'Display directory space usage',
    examples: ['du -h', 'du -sh *', 'du -h --max-depth=1']
  },
  'free': {
    command: 'free',
    description: 'Display memory usage',
    examples: ['free -h', 'free -m']
  },
  'uptime': {
    command: 'uptime',
    description: 'Show system uptime and load'
  },
  'whoami': {
    command: 'whoami',
    description: 'Display current username'
  },
  'who': {
    command: 'who',
    description: 'Show logged in users'
  },
  'history': {
    command: 'history',
    description: 'Display command history'
  },
  'clear': {
    command: 'clear',
    description: 'Clear terminal screen'
  },
  'exit': {
    command: 'exit',
    description: 'Exit terminal session'
  },
  
  // เพิ่มคำสั่งใหม่ที่นี่
  'systemctl': {
    command: 'systemctl',
    description: 'Control systemd services',
    examples: ['systemctl status nginx', 'systemctl restart apache2', 'systemctl enable mysql']
  },
  'service': {
    command: 'service',
    description: 'Control system services',
    examples: ['service nginx status', 'service apache2 restart']
  },
  'netstat': {
    command: 'netstat',
    description: 'Display network connections',
    examples: ['netstat -tulpn', 'netstat -r', 'netstat -i']
  },
  'ss': {
    command: 'ss',
    description: 'Modern netstat replacement',
    examples: ['ss -tulpn', 'ss -s', 'ss -t state established']
  },
  'iptables': {
    command: 'iptables',
    description: 'Configure firewall rules',
    examples: ['iptables -L', 'iptables -A INPUT -p tcp --dport 80 -j ACCEPT']
  },
  'ufw': {
    command: 'ufw',
    description: 'Uncomplicated Firewall',
    examples: ['ufw status', 'ufw enable', 'ufw allow 22']
  },
  'wget': {
    command: 'wget',
    description: 'Download files from web',
    examples: ['wget http://example.com/file.zip', 'wget -r http://example.com/']
  },
  'curl': {
    command: 'curl',
    description: 'Transfer data from/to servers',
    examples: ['curl http://example.com', 'curl -X POST -d "data" http://api.com']
  },
  'rsync': {
    command: 'rsync',
    description: 'Synchronize files/directories',
    examples: ['rsync -av source/ dest/', 'rsync -av --delete source/ dest/']
  },
  'tar': {
    command: 'tar',
    description: 'Archive files',
    examples: ['tar -czf archive.tar.gz files/', 'tar -xzf archive.tar.gz']
  },
  'zip': {
    command: 'zip',
    description: 'Create zip archives',
    examples: ['zip -r archive.zip files/', 'zip file.zip file.txt']
  },
  'unzip': {
    command: 'unzip',
    description: 'Extract zip archives',
    examples: ['unzip archive.zip', 'unzip -l archive.zip']
  },
  'crontab': {
    command: 'crontab',
    description: 'Schedule tasks',
    examples: ['crontab -l', 'crontab -e']
  },
  'mount': {
    command: 'mount',
    description: 'Mount filesystems',
    examples: ['mount /dev/sdb1 /mnt', 'mount -t nfs server:/path /mnt']
  },
  'umount': {
    command: 'umount',
    description: 'Unmount filesystems',
    examples: ['umount /mnt', 'umount /dev/sdb1']
  },
  'lsof': {
    command: 'lsof',
    description: 'List open files',
    examples: ['lsof -i :80', 'lsof -p 1234', 'lsof /path/to/file']
  },
  'awk': {
    command: 'awk',
    description: 'Text processing tool',
    examples: ['awk \'{print $1}\' file.txt', 'ps aux | awk \'{print $1, $11}\'']
  },
  'sed': {
    command: 'sed',
    description: 'Stream editor',
    examples: ['sed \'s/old/new/g\' file.txt', 'sed -n \'1,10p\' file.txt']
  },
  'sort': {
    command: 'sort',
    description: 'Sort lines of text',
    examples: ['sort file.txt', 'sort -n numbers.txt', 'sort -r file.txt']
  },
  'uniq': {
    command: 'uniq',
    description: 'Report or omit repeated lines',
    examples: ['uniq file.txt', 'sort file.txt | uniq -c']
  },
  'wc': {
    command: 'wc',
    description: 'Count lines, words, characters',
    examples: ['wc -l file.txt', 'wc -w file.txt', 'wc -c file.txt']
  },
  'xargs': {
    command: 'xargs',
    description: 'Build and execute commands from input',
    examples: ['find . -name "*.tmp" | xargs rm', 'echo "arg1 arg2" | xargs echo']
  },
  'watch': {
    command: 'watch',
    description: 'Execute command repeatedly',
    examples: ['watch -n 1 "df -h"', 'watch "ps aux | grep nginx"']
  }
};

// Dangerous commands that should show warnings
export const DANGEROUS_COMMANDS = [
  'rm -rf',
  'mkfs',
  'dd if=/dev/zero',
  'format',
  'fdisk',
  'parted',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff'
];

// Check if command is potentially dangerous
export function isDangerousCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase().trim();
  return DANGEROUS_COMMANDS.some(dangerous => 
    lowerCommand.includes(dangerous.toLowerCase())
  );
}

// Get command suggestions based on partial input
export function getCommandSuggestions(partial: string): string[] {
  if (!partial) return [];
  
  const suggestions = Object.keys(COMMON_COMMANDS)
    .filter(cmd => cmd.startsWith(partial.toLowerCase()))
    .slice(0, 10);
  
  return suggestions;
}

// Parse command and extract useful information
export function parseCommand(command: string): {
  baseCommand: string;
  args: string[];
  flags: string[];
  isDangerous: boolean;
} {
  const parts = command.trim().split(/\s+/);
  const baseCommand = parts[0] || '';
  const args = parts.slice(1);
  const flags = args.filter(arg => arg.startsWith('-'));
  
  return {
    baseCommand,
    args,
    flags,
    isDangerous: isDangerousCommand(command)
  };
}

// Format file permissions for display
export function formatPermissions(mode: string): string {
  const permissions = parseInt(mode, 8).toString(2).padStart(9, '0');
  const chars = ['r', 'w', 'x'];
  let result = '';
  
  for (let i = 0; i < 9; i += 3) {
    const group = permissions.slice(i, i + 3);
    result += group.split('').map((bit, index) => 
      bit === '1' ? chars[index] : '-'
    ).join('');
  }
  
  return result;
}

// Format file size for human readable display
export function formatFileSize(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)}${units[unitIndex]}`;
}

// Escape shell special characters
export function escapeShellArg(arg: string): string {
  return arg.replace(/(["\s'$`\\])/g, '\\$1');
}

// Build safe command with escaped arguments
export function buildSafeCommand(command: string, args: string[]): string {
  return [command, ...args.map(escapeShellArg)].join(' ');
}

// Extract directory path from ls -la output
export function parseLsOutput(output: string): Array<{
  permissions: string;
  links: string;
  owner: string;
  group: string;
  size: string;
  date: string;
  name: string;
  isDirectory: boolean;
}> {
  const lines = output.trim().split('\n');
  const result = [];
  
  for (let i = 1; i < lines.length; i++) { // Skip first line (total)
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    
    const permissions = parts[0];
    const isDirectory = permissions.startsWith('d');
    
    result.push({
      permissions,
      links: parts[1],
      owner: parts[2],
      group: parts[3],
      size: parts[4],
      date: `${parts[5]} ${parts[6]} ${parts[7]}`,
      name: parts.slice(8).join(' '),
      isDirectory
    });
  }
  
  return result;
}

// Get command help text
export function getCommandHelp(command: string): string {
  const cmd = COMMON_COMMANDS[command.toLowerCase()];
  if (!cmd) return `No help available for command: ${command}`;
  
  let help = `${cmd.command} - ${cmd.description}\n`;
  
  if (cmd.examples && cmd.examples.length > 0) {
    help += '\nExamples:\n';
    cmd.examples.forEach(example => {
      help += `  ${example}\n`;
    });
  }
  
  if (cmd.dangerous) {
    help += '\n⚠️  WARNING: This command can be dangerous. Use with caution!\n';
  }
  
  return help;
}

// Validate command before execution
export function validateCommand(command: string): {
  isValid: boolean;
  warnings: string[];
  suggestions?: string[];
} {
  const warnings: string[] = [];
  const trimmedCommand = command.trim();
  
  if (!trimmedCommand) {
    return { isValid: false, warnings: ['Empty command'] };
  }
  
  if (isDangerousCommand(trimmedCommand)) {
    warnings.push('⚠️ This command is potentially dangerous!');
  }
  
  const { baseCommand } = parseCommand(trimmedCommand);
  
  // Check for common typos only for basic commands
  const commonTypos: Record<string, string> = {
    'll': 'ls -la',
    'sl': 'ls',
    'cd..': 'cd ..',
    'claer': 'clear',
    'exti': 'exit'
  };
  
  if (commonTypos[baseCommand]) {
    return {
      isValid: false,
      warnings: [`Did you mean: ${commonTypos[baseCommand]}?`],
      suggestions: [commonTypos[baseCommand]]
    };
  }
  
  // Allow all commands by default - let the server handle if command exists
  return {
    isValid: true,
    warnings
  };
}

// Generate random session ID
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Format terminal prompt
export function formatPrompt(username: string, hostname: string, currentDir: string): string {
  const shortDir = currentDir.length > 20 ? '...' + currentDir.slice(-17) : currentDir;
  return `${username}@${hostname}:${shortDir}$ `;
}

// Check if command needs sudo
export function needsSudo(command: string): boolean {
  const sudoCommands = [
    'systemctl',
    'service',
    'mount',
    'umount',
    'fdisk',
    'parted',
    'apt',
    'yum',
    'dnf',
    'pacman',
    'iptables',
    'ufw',
    'reboot',
    'shutdown',
    'halt',
    'poweroff'
  ];
  
  const { baseCommand } = parseCommand(command);
  return sudoCommands.includes(baseCommand.toLowerCase());
}