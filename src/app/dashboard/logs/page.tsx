'use client';

import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader,
  Calendar,
  Server as ServerIcon
} from 'lucide-react';
import Layout from '@/components/Layout';
import { formatRelativeTime, formatDuration, getScriptStatusColor, getScriptStatusText } from '@/lib/utils';
import type { ScriptLog, Server, ApiResponse, PaginatedResponse } from '@/types';

export default function LogsPage() {
  const [logs, setLogs] = useState<ScriptLog[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ScriptLog | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serverFilter, setServerFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('startTime');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchServers();
    fetchLogs();
  }, [currentPage, search, statusFilter, serverFilter, startDate, endDate, sortBy, sortOrder]);

  const fetchServers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/servers?limit=100', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: ApiResponse<Server[]> = await response.json();
        if (data.success) {
          setServers(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    }
  };

  const fetchLogs = async () => {
    if (currentPage === 1) {
      setLoading(true);
    }

    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      
      params.append('page', currentPage.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (serverFilter) params.append('serverId', serverFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const response = await fetch(`/api/scripts/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: PaginatedResponse<ScriptLog> = await response.json();
        if (data.success) {
          setLogs(data.data || []);
          setTotalPages(data.pagination.totalPages);
          setTotalLogs(data.pagination.total);
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setServerFilter('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const exportLogs = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (serverFilter) params.append('serverId', serverFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('limit', '1000'); // Export more records

      const response = await fetch(`/api/scripts/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data: PaginatedResponse<ScriptLog> = await response.json();
        if (data.success) {
          // Convert to CSV
          const csvContent = convertToCSV(data.data || []);
          downloadCSV(csvContent, 'script-logs.csv');
        }
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  const convertToCSV = (logs: ScriptLog[]): string => {
    const headers = [
      'Script Name',
      'Command',
      'Server',
      'Status',
      'Start Time',
      'End Time',
      'Duration (seconds)',
      'Output',
      'Error'
    ];

    const rows = logs.map(log => [
      log.scriptName,
      log.command,
      log.server?.name || 'Unknown',
      log.status,
      log.startTime,
      log.endTime || '',
      log.duration || '',
      log.output || '',
      log.error || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csvContent;
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'RUNNING':
        return <Loader className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'CANCELLED':
        return <Clock className="h-4 w-4 text-gray-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const viewLogDetails = (log: ScriptLog) => {
    setSelectedLog(log);
    setShowModal(true);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Script Execution Logs</h1>
              <p className="mt-1 text-sm text-gray-500">
                View and analyze script execution history across all servers
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={refreshLogs}
                disabled={refreshing}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={exportLogs}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white shadow-soft rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Script name or command..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 form-input"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-input"
              >
                <option value="">All Status</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
                <option value="RUNNING">Running</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Server Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Server</label>
              <select
                value={serverFilter}
                onChange={(e) => setServerFilter(e.target.value)}
                className="form-input"
              >
                <option value="">All Servers</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id.toString()}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="startTime">Start Time</option>
                  <option value="duration">Duration</option>
                  <option value="status">Status</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
            </div>
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-4 text-sm text-gray-600">
          Showing {logs.length} of {totalLogs} script executions
        </div>

        {/* Logs Table */}
        <div className="bg-white shadow-soft rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <Loader className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto h-24 w-24 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No logs found</h3>
              <p className="text-gray-500">No script execution logs match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Script</th>
                    <th className="table-header">Server</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Started</th>
                    <th className="table-header">Duration</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="table-row">
                      <td className="table-cell">
                        <div>
                          <div className="font-medium text-gray-900">{log.scriptName}</div>
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {log.command}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center">
                          <ServerIcon className="h-4 w-4 text-gray-400 mr-2" />
                          <span>{log.server?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center">
                          {getStatusIcon(log.status)}
                          <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScriptStatusColor(log.status)}`}>
                            {getScriptStatusText(log.status)}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div>
                          <div className="text-sm text-gray-900">
                            {formatRelativeTime(log.startTime)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(log.startTime).toLocaleString()}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        {log.duration ? formatDuration(log.duration * 1000) : '-'}
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => viewLogDetails(log)}
                          className="text-blue-600 hover:text-blue-800 transition-colors duration-150"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Log Details Modal */}
        {showModal && selectedLog && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-container max-w-4xl" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="text-lg font-medium text-gray-900">Script Execution Details</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="modal-body">
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Script Name</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLog.scriptName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Server</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLog.server?.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <div className="mt-1 flex items-center">
                        {getStatusIcon(selectedLog.status)}
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScriptStatusColor(selectedLog.status)}`}>
                          {getScriptStatusText(selectedLog.status)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Duration</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedLog.duration ? formatDuration(selectedLog.duration * 1000) : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Command */}
                  <div>
                    <label className="text-sm font-medium text-gray-500">Command</label>
                    <pre className="mt-1 bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                      {selectedLog.command}
                    </pre>
                  </div>

                  {/* Output */}
                  {selectedLog.output && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Output</label>
                      <pre className="mt-1 bg-gray-900 text-green-400 p-4 rounded text-sm overflow-x-auto max-h-64">
                        {selectedLog.output}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {selectedLog.error && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Error</label>
                      <pre className="mt-1 bg-red-50 text-red-800 p-4 rounded text-sm overflow-x-auto max-h-64">
                        {selectedLog.error}
                      </pre>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Start Time</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(selectedLog.startTime).toLocaleString()}
                      </p>
                    </div>
                    {selectedLog.endTime && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">End Time</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {new Date(selectedLog.endTime).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <button
                  onClick={() => setShowModal(false)}
                  className="btn-outline"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}