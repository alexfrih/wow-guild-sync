import React, { useState, useEffect, useRef } from 'react';
import { ScrollText, Circle, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import io from 'socket.io-client';

function Logs() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to Socket.IO server
    socketRef.current = io('/', {
      transports: ['websocket', 'polling']
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to Socket.IO server');
      setConnected(true);
      setLogs(prev => [...prev, {
        id: Date.now(),
        type: 'system',
        message: '🔌 Connected to real-time log stream',
        timestamp: new Date().toISOString()
      }]);
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
      setConnected(false);
      setLogs(prev => [...prev, {
        id: Date.now(),
        type: 'system',
        message: '⚠️ Disconnected from real-time log stream',
        timestamp: new Date().toISOString()
      }]);
    });

    socketRef.current.on('log', (log) => {
      setLogs(prev => {
        // Keep only last 500 logs
        const newLogs = [...prev, { ...log, id: Date.now() + Math.random() }];
        if (newLogs.length > 500) {
          return newLogs.slice(-500);
        }
        return newLogs;
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const getLogIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'system':
        return <Circle className="w-4 h-4 text-blue-500" />;
      default:
        return <Circle className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'success':
        return 'text-green-400 bg-green-900/20 border-green-800';
      case 'error':
        return 'text-red-400 bg-red-900/20 border-red-800';
      case 'warning':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-800';
      case 'system':
        return 'text-blue-400 bg-blue-900/20 border-blue-800';
      default:
        return 'text-zinc-300 bg-zinc-900 border-zinc-800';
    }
  };

  const clearLogs = () => {
    setLogs([{
      id: Date.now(),
      type: 'system',
      message: '🧹 Logs cleared',
      timestamp: new Date().toISOString()
    }]);
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="bg-zinc-950 text-zinc-100 min-h-screen">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
          {/* Header */}
          <div className="border-b border-zinc-800 p-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-[#ff8000] flex items-center gap-3">
                <ScrollText className="w-6 h-6" />
                Real-time Sync Logs
              </h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                  <span className="text-sm text-zinc-400">
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                    autoScroll 
                      ? 'bg-[#ff8000] text-zinc-900 hover:bg-orange-600' 
                      : 'bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
                  }`}
                >
                  Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={clearLogs}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-medium px-4 py-2 rounded-lg transition-colors duration-200"
                >
                  Clear Logs
                </button>
              </div>
            </div>
          </div>

          {/* Logs */}
          <div className="p-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto p-4 space-y-2 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <ScrollText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Waiting for logs...</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <div 
                      key={log.id}
                      className={`flex items-start gap-3 p-3 rounded border ${getLogColor(log.type)}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getLogIcon(log.type)}
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-zinc-500 text-xs">
                            {formatTimestamp(log.timestamp)}
                          </span>
                          {log.character && (
                            <span className="text-[#ff8000] text-xs font-bold">
                              [{log.character}]
                            </span>
                          )}
                        </div>
                        <div className="break-all">{log.message}</div>
                        {log.data && (
                          <div className="mt-2 text-xs text-zinc-400">
                            {Object.entries(log.data).map(([key, value]) => (
                              <span key={key} className="mr-3">
                                {key}: <span className="text-zinc-300">{value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="border-t border-zinc-800 p-6">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <div>
                Total logs: <span className="text-zinc-200 font-medium">{logs.length}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>{logs.filter(l => l.type === 'success').length} Success</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span>{logs.filter(l => l.type === 'warning').length} Warning</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span>{logs.filter(l => l.type === 'error').length} Error</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Logs;