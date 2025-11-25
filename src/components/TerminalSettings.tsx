'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, 
  Palette, 
  Type, 
  Shield, 
  Download, 
  Upload, 
  RotateCcw, 
  Save,
  X,
  Monitor,
  Volume2,
  VolumeX,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  terminalConfigManager,
  TERMINAL_THEMES,
  TERMINAL_FONTS,
  FONT_SIZES,
  validateTerminalConfig
} from '@/lib/terminal-config';
import type { TerminalConfig, SecurityPolicy } from '@/types';

interface TerminalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange?: (config: TerminalConfig) => void;
}

export default function TerminalSettings({ 
  isOpen, 
  onClose, 
  onConfigChange 
}: TerminalSettingsProps) {
  const [config, setConfig] = useState<TerminalConfig>(terminalConfigManager.getConfig());
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicy>(
    terminalConfigManager.getSecurityPolicy()
  );
  const [activeTab, setActiveTab] = useState<'appearance' | 'behavior' | 'security'>('appearance');
  const [errors, setErrors] = useState<string[]>([]);
  const [importExportMode, setImportExportMode] = useState<'import' | 'export' | null>(null);
  const [configText, setConfigText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfig(terminalConfigManager.getConfig());
      setSecurityPolicy(terminalConfigManager.getSecurityPolicy());
      setErrors([]);
    }
  }, [isOpen]);

  const handleConfigChange = (updates: Partial<TerminalConfig>) => {
    const newConfig = { ...config, ...updates };
    const validationErrors = validateTerminalConfig(updates);
    
    setErrors(validationErrors);
    
    if (validationErrors.length === 0) {
      setConfig(newConfig);
    }
  };

  const handleSecurityPolicyChange = (updates: Partial<SecurityPolicy>) => {
    setSecurityPolicy({ ...securityPolicy, ...updates });
  };

  const handleSave = () => {
    if (errors.length === 0) {
      terminalConfigManager.updateConfig(config);
      terminalConfigManager.updateSecurityPolicy(securityPolicy);
      onConfigChange?.(config);
      onClose();
    }
  };

  const handleReset = () => {
    terminalConfigManager.resetConfig();
    terminalConfigManager.resetSecurityPolicy();
    setConfig(terminalConfigManager.getConfig());
    setSecurityPolicy(terminalConfigManager.getSecurityPolicy());
    setErrors([]);
  };

  const handleExport = () => {
    const exportData = terminalConfigManager.exportConfig();
    setConfigText(exportData);
    setImportExportMode('export');
  };

  const handleImport = () => {
    if (configText.trim()) {
      const success = terminalConfigManager.importConfig(configText);
      if (success) {
        setConfig(terminalConfigManager.getConfig());
        setSecurityPolicy(terminalConfigManager.getSecurityPolicy());
        setImportExportMode(null);
        setConfigText('');
      } else {
        setErrors(['Invalid configuration format']);
      }
    }
  };

  const downloadConfig = () => {
    const blob = new Blob([configText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'terminal-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const previewTheme = terminalConfigManager.getTheme(config.theme);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container max-w-4xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg mr-3">
              <Settings className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">
              Terminal Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors duration-150"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'appearance', label: 'Appearance', icon: Palette },
              { id: 'behavior', label: 'Behavior', icon: Monitor },
              { id: 'security', label: 'Security', icon: Shield }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="modal-body max-h-96 overflow-y-auto">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <ul className="text-sm text-red-700">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* Theme Selection */}
              <div>
                <label className="form-label">Theme</label>
                <div className="grid grid-cols-2 gap-3">
                  {terminalConfigManager.getAvailableThemes().map(({ key, name }) => {
                    const theme = TERMINAL_THEMES[key as keyof typeof TERMINAL_THEMES];
                    return (
                      <button
                        key={key}
                        onClick={() => handleConfigChange({ theme: key as any })}
                        className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                          config.theme === key
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className="h-8 w-full rounded mb-2"
                          style={{ background: theme.background }}
                        />
                        <div className="text-sm font-medium text-gray-900">{name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          <span 
                            className="inline-block w-3 h-3 rounded-full mr-1"
                            style={{ backgroundColor: theme.foreground }}
                          />
                          <span 
                            className="inline-block w-3 h-3 rounded-full mr-1"
                            style={{ backgroundColor: theme.green }}
                          />
                          <span 
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: theme.blue }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Font Family</label>
                  <select
                    value={config.fontFamily}
                    onChange={(e) => handleConfigChange({ fontFamily: e.target.value })}
                    className="form-input"
                  >
                    {TERMINAL_FONTS.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Font Size</label>
                  <select
                    value={config.fontSize}
                    onChange={(e) => handleConfigChange({ fontSize: parseInt(e.target.value) })}
                    className="form-input"
                  >
                    {FONT_SIZES.map(size => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cursor Settings */}
              <div>
                <label className="form-label">Cursor</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={config.cursorBlink}
                      onChange={(e) => handleConfigChange({ cursorBlink: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Blinking cursor</span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="form-label">Preview</label>
                <div
                  className="p-4 rounded-lg font-mono text-sm"
                  style={{
                    background: previewTheme.background,
                    color: previewTheme.foreground,
                    fontFamily: config.fontFamily,
                    fontSize: `${config.fontSize}px`
                  }}
                >
                  <div style={{ color: previewTheme.green }}>
                    user@server:~$ <span style={{ color: previewTheme.foreground }}>ls -la</span>
                  </div>
                  <div style={{ color: previewTheme.blue }}>drwxr-xr-x</div>
                  <div style={{ color: previewTheme.yellow }}>-rw-r--r--</div>
                  <div style={{ color: previewTheme.red }}>error: command not found</div>
                </div>
              </div>
            </div>
          )}

          {/* Behavior Tab */}
          {activeTab === 'behavior' && (
            <div className="space-y-6">
              {/* Scrollback */}
              <div>
                <label className="form-label">
                  Scrollback Lines ({config.scrollback})
                </label>
                <input
                  type="range"
                  min="100"
                  max="10000"
                  step="100"
                  value={config.scrollback}
                  onChange={(e) => handleConfigChange({ scrollback: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>100</span>
                  <span>10,000</span>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-4">
                <label className="form-label">Features</label>
                
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Type className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-sm text-gray-700">Tab Completion</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.tabCompletion}
                      onChange={(e) => handleConfigChange({ tabCompletion: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Monitor className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-sm text-gray-700">Command History</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.commandHistory}
                      onChange={(e) => handleConfigChange({ commandHistory: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      {config.bellSound ? (
                        <Volume2 className="h-4 w-4 mr-2 text-gray-500" />
                      ) : (
                        <VolumeX className="h-4 w-4 mr-2 text-gray-500" />
                      )}
                      <span className="text-sm text-gray-700">Bell Sound</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.bellSound}
                      onChange={(e) => handleConfigChange({ bellSound: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Eye className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-sm text-gray-700">Copy on Select</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.copyOnSelect}
                      onChange={(e) => handleConfigChange({ copyOnSelect: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Monitor className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-sm text-gray-700">Paste with Middle Click</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.pasteWithMiddleClick}
                      onChange={(e) => handleConfigChange({ pasteWithMiddleClick: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Security Options */}
              <div className="space-y-4">
                <label className="form-label">Security Options</label>
                
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-700">Allow Dangerous Commands</div>
                      <div className="text-xs text-gray-500">
                        Allow execution of potentially dangerous commands with confirmation
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={securityPolicy.allowDangerousCommands}
                      onChange={(e) => handleSecurityPolicyChange({ 
                        allowDangerousCommands: e.target.checked 
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-700">Require Sudo Confirmation</div>
                      <div className="text-xs text-gray-500">
                        Show confirmation dialog for sudo commands
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={securityPolicy.requireSudoConfirmation}
                      onChange={(e) => handleSecurityPolicyChange({ 
                        requireSudoConfirmation: e.target.checked 
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-700">Enable Command Logging</div>
                      <div className="text-xs text-gray-500">
                        Log all executed commands for audit purposes
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={securityPolicy.enableCommandLogging}
                      onChange={(e) => handleSecurityPolicyChange({ 
                        enableCommandLogging: e.target.checked 
                      })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>

              {/* Command Length Limit */}
              <div>
                <label className="form-label">
                  Maximum Command Length ({securityPolicy.maxCommandLength} characters)
                </label>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="50"
                  value={securityPolicy.maxCommandLength}
                  onChange={(e) => handleSecurityPolicyChange({ 
                    maxCommandLength: parseInt(e.target.value) 
                  })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>100</span>
                  <span>5,000</span>
                </div>
              </div>

              {/* Blocked Commands */}
              <div>
                <label className="form-label">Blocked Commands</label>
                <div className="space-y-2">
                  {securityPolicy.blockedCommands.map((command, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-red-50 rounded">
                      <code className="text-sm text-red-700">{command}</code>
                      <button
                        onClick={() => {
                          const newCommands = securityPolicy.blockedCommands.filter((_, i) => i !== index);
                          handleSecurityPolicyChange({ blockedCommands: newCommands });
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Import/Export */}
          {importExportMode && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">
                {importExportMode === 'export' ? 'Export Configuration' : 'Import Configuration'}
              </h4>
              
              <textarea
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                className="w-full h-32 p-3 border border-gray-300 rounded-md font-mono text-xs"
                placeholder={importExportMode === 'import' ? 'Paste configuration JSON here...' : ''}
                readOnly={importExportMode === 'export'}
              />
              
              <div className="flex justify-between mt-3">
                <button
                  onClick={() => setImportExportMode(null)}
                  className="btn-outline"
                >
                  Cancel
                </button>
                
                <div className="space-x-2">
                  {importExportMode === 'export' && (
                    <button onClick={downloadConfig} className="btn-secondary">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </button>
                  )}
                  
                  {importExportMode === 'import' && (
                    <button onClick={handleImport} className="btn-primary">
                      <Upload className="h-4 w-4 mr-1" />
                      Import
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="flex justify-between w-full">
            <div className="space-x-2">
              <button onClick={handleExport} className="btn-outline">
                <Download className="h-4 w-4 mr-1" />
                Export
              </button>
              <button onClick={() => setImportExportMode('import')} className="btn-outline">
                <Upload className="h-4 w-4 mr-1" />
                Import
              </button>
            </div>
            
            <div className="space-x-2">
              <button onClick={handleReset} className="btn-outline">
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </button>
              <button onClick={onClose} className="btn-outline">
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                className="btn-primary"
                disabled={errors.length > 0}
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}