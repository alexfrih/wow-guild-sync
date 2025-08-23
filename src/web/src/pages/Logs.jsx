import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

function Logs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const socket = io();
    
    socket.on('log', (logData) => {
      console.log('📝 New log received:', logData);
      setLogs(prevLogs => [logData, ...prevLogs.slice(0, 99)]); // Keep last 100 logs
    });

    return () => socket.disconnect();
  }, []);

  const getLogIcon = (type) => {
    switch(type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'info': return 'ℹ️';
      default: return '📝';
    }
  };

  const getLogColor = (type) => {
    switch(type) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'info': return 'text-blue-400';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-zinc-100">
      <div className="container mx-auto px-6 py-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-orange-500 mb-2">
            📝 Live Logs
          </h1>
          <p className="text-zinc-400 text-lg">Real-time sync activity</p>
        </div>

        {/* Logs Container */}
        <div className="bg-zinc-900/50 backdrop-blur rounded-lg border border-zinc-700/50 shadow-2xl overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-zinc-100 mb-4 flex items-center gap-2">
              <span className="animate-pulse">🔴</span>
              Live Activity
            </h2>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <div key={index} 
                       className="flex items-start gap-3 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/30">
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {getLogIcon(log.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${getLogColor(log.type)}`}>
                        {log.message}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                        <span>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        {log.stats && (
                          <span className="flex items-center gap-2">
                            <span className="text-green-400">
                              ✓ {log.stats.processed || 0}
                            </span>
                            {log.stats.errors > 0 && (
                              <span className="text-red-400">
                                ✗ {log.stats.errors}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <div className="animate-pulse text-4xl mb-4">⏳</div>
                  <p className="text-zinc-400 text-lg">Waiting for sync activity...</p>
                  <p className="text-zinc-500 text-sm mt-2">
                    Logs will appear here in real-time when the sync service processes data
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        {logs.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {logs.filter(log => log.type === 'success').length}
              </div>
              <div className="text-sm text-zinc-400">Success</div>
            </div>
            <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {logs.filter(log => log.type === 'warning').length}
              </div>
              <div className="text-sm text-zinc-400">Warnings</div>
            </div>
            <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-4 text-center">
              <div className="text-2xl font-bold text-red-400">
                {logs.filter(log => log.type === 'error').length}
              </div>
              <div className="text-sm text-zinc-400">Errors</div>
            </div>
            <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-4 text-center">
              <div className="text-2xl font-bold text-zinc-300">
                {logs.length}
              </div>
              <div className="text-sm text-zinc-400">Total</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default Logs;