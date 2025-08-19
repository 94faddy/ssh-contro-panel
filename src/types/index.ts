// User Types
export interface User {
  id: number;
  email: string;
  name: string;
  role: 'ADMIN' | 'DEVELOPER';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: 'ADMIN' | 'DEVELOPER';
}

// Server Types
export interface Server {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  isActive: boolean;
  status: ServerStatus;
  lastChecked?: string;
  systemInfo?: SystemInfo;
  createdAt: string;
  updatedAt: string;
  userId: number;
}

export interface CreateServerData {
  name: string;
  host: string;
  port?: number;
  username: string;
  password: string;
}

export interface UpdateServerData {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  isActive?: boolean;
}

export type ServerStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'CONNECTING';

export interface SystemInfo {
  os: string;
  arch: string;
  platform: string;
  uptime: number;
  loadAverage: number[];
  totalMemory: number;
  freeMemory: number;
  cpuCount: number;
  diskUsage?: DiskUsage[];
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: string;
  mountPoint: string;
}

// Script Types
export interface ScriptLog {
  id: number;
  scriptName: string;
  command: string;
  status: ScriptStatus;
  output?: string;
  error?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  userId: number;
  serverId: number;
  server?: Server;
}

export type ScriptStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface RunScriptData {
  scriptName: string;
  command: string;
  serverIds: number[];
}

export interface ScriptExecution {
  id: string;
  serverId: number;
  serverName: string;
  command: string;
  status: ScriptStatus;
  output: string;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

// Enhanced Terminal Types
export interface TerminalSession {
  id: string;
  serverId: number;
  userId: number;
  isActive: boolean;
  createdAt: Date;
}

export interface TerminalCommand {
  sessionId: string;
  command: string;
  timestamp: Date;
}

export interface TerminalOutput {
  sessionId: string;
  output: string;
  type: 'stdout' | 'stderr';
  timestamp: Date;
}

// Terminal WebSocket Message Types
export interface TerminalConnectMessage {
  serverId: number;
}

export interface TerminalCommandMessage {
  sessionId: string;
  command: string;
}

export interface TerminalOutputMessage {
  sessionId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  currentDir: string;
  timestamp: string;
}

export interface TerminalTabCompleteMessage {
  sessionId: string;
  partial: string;
  currentDir: string;
}

export interface TerminalTabCompleteResult {
  sessionId: string;
  partial: string;
  completions: string[];
}

export interface TerminalConnectedMessage {
  sessionId: string;
  serverName: string;
  serverId: number;
  currentDir?: string;
}

export interface TerminalErrorMessage {
  error: string;
  details?: string;
}

// Shell Session Types
export interface ShellSession {
  ssh: any; // NodeSSH instance
  cwd: string;
  env: Record<string, string>;
  userId: number;
  serverId: number;
}

export interface ShellCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
}

// Command History Entry
export interface CommandHistoryEntry {
  command: string;
  timestamp: Date;
  exitCode?: number;
  workingDir?: string;
}

// WebSocket Types
export interface WSMessage {
  type: 'terminal' | 'script' | 'server-status' | 'error';
  sessionId?: string;
  serverId?: number;
  data: any;
  timestamp: Date;
}

export interface TerminalWSMessage extends WSMessage {
  type: 'terminal';
  data: {
    command?: string;
    output?: string;
    error?: string;
    type?: 'input' | 'output' | 'error' | 'connect' | 'disconnect';
    currentDir?: string;
    exitCode?: number;
  };
}

export interface ScriptWSMessage extends WSMessage {
  type: 'script';
  data: {
    scriptId: string;
    serverId: number;
    serverName: string;
    status: ScriptStatus;
    output?: string;
    error?: string;
    progress?: number;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Dashboard Types
export interface DashboardStats {
  totalServers: number;
  connectedServers: number;
  disconnectedServers: number;
  runningScripts: number;
  totalScripts: number;
  successRate: number;
}

export interface ServerStatsData {
  serverId: number;
  serverName: string;
  status: ServerStatus;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  uptime?: number;
  lastChecked?: string;
}

// Filter Types
export interface ServerFilter {
  status?: ServerStatus;
  search?: string;
  sortBy?: 'name' | 'host' | 'status' | 'lastChecked';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ScriptLogFilter {
  status?: ScriptStatus;
  serverId?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'startTime' | 'duration' | 'status';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// Component Props Types
export interface ServerCardProps {
  server: Server;
  onEdit: (server: Server) => void;
  onDelete: (serverId: number) => void;
  onConnect: (serverId: number) => void;
  onTerminal: (serverId: number) => void;
}

export interface TerminalProps {
  serverId: number;
  serverName: string;
  onClose: () => void;
}

// Enhanced Terminal Props
export interface EnhancedTerminalProps extends TerminalProps {
  enableTabCompletion?: boolean;
  enableCopyPaste?: boolean;
  maxHistorySize?: number;
  enableCommandValidation?: boolean;
  showWorkingDirectory?: boolean;
}

export interface ScriptRunnerProps {
  servers: Server[];
  onClose: () => void;
}

// Form Types
export interface ServerFormData {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface ScriptFormData {
  name: string;
  command: string;
  serverIds: number[];
}

// Terminal Configuration Types
export interface TerminalConfig {
  fontSize: number;
  fontFamily: string;
  theme: 'dark' | 'light';
  cursorBlink: boolean;
  scrollback: number;
  bellSound: boolean;
  tabCompletion: boolean;
  commandHistory: boolean;
  copyOnSelect: boolean;
  pasteWithMiddleClick: boolean;
}

// Command Execution Types
export interface CommandExecutionOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  encoding?: string;
  shell?: string;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timestamp: Date;
  workingDirectory: string;
}

// Terminal UI State Types
export interface TerminalState {
  isConnected: boolean;
  isConnecting: boolean;
  sessionId: string | null;
  currentDirectory: string;
  commandHistory: string[];
  historyIndex: number;
  currentCommand: string;
  isCommandRunning: boolean;
  outputs: TerminalOutputLine[];
}

export interface TerminalOutputLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
  command?: string;
  exitCode?: number;
  copyable?: boolean;
}

// SSH Connection Types
export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  privateKey?: string;
  passphrase?: string;
  timeout?: number;
  keepaliveInterval?: number;
  algorithms?: {
    kex?: string[];
    cipher?: string[];
    hmac?: string[];
    serverHostKey?: string[];
  };
}

export interface SSHConnectionStatus {
  connected: boolean;
  connecting: boolean;
  error?: string;
  lastConnected?: Date;
  connectionDuration?: number;
}

// File System Types (for file operations in terminal)
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
  owner: string;
  group: string;
  modified: Date;
  accessed: Date;
}

export interface DirectoryListing {
  path: string;
  files: FileInfo[];
  totalSize: number;
  hiddenFiles: number;
}

// Terminal Features Types
export interface TabCompletionResult {
  completions: string[];
  partial: string;
  hasMore: boolean;
}

export interface CommandSuggestion {
  command: string;
  description: string;
  category: string;
  usage?: string;
  examples?: string[];
}

// Monitoring Types (for system monitoring in terminal)
export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    cached: number;
    buffers: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  uptime: number;
  loadAverage: number[];
}

// Error Types
export interface TerminalError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  recoverable: boolean;
}

export interface SSHError extends TerminalError {
  connectionLost: boolean;
  authFailure: boolean;
  networkError: boolean;
}

// Event Types
export interface TerminalEvent {
  type: 'connect' | 'disconnect' | 'command' | 'output' | 'error' | 'resize';
  sessionId: string;
  timestamp: Date;
  data?: any;
}

// Security Types
export interface CommandValidation {
  allowed: boolean;
  dangerous: boolean;
  requiresConfirmation: boolean;
  warning?: string;
  suggestion?: string;
}

export interface SecurityPolicy {
  allowDangerousCommands: boolean;
  blockedCommands: string[];
  requireSudoConfirmation: boolean;
  maxCommandLength: number;
  enableCommandLogging: boolean;
}

// Performance Types
export interface TerminalMetrics {
  commandsExecuted: number;
  averageResponseTime: number;
  errorRate: number;
  sessionDuration: number;
  dataTransferred: number;
}