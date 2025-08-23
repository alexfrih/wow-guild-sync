import React, { useState, useEffect } from 'react';

function Errors() {
  const [errorData, setErrorData] = useState({
    errors: [],
    stats: {
      total: 0,
      last24h: 0,
      errorTypes: []
    },
    count: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchErrors();
  }, []);

  const fetchErrors = async () => {
    try {
      const response = await fetch('/api/errors?limit=50');
      const data = await response.json();
      setErrorData(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch errors:', error);
      setLoading(false);
    }
  };

  const getErrorTypeColor = (errorType) => {
    switch(errorType) {
      case 'api_404': return 'text-yellow-400';
      case 'api_timeout': return 'text-red-400';
      case 'parse_error': return 'text-purple-400';
      case 'unknown_error': return 'text-zinc-400';
      default: return 'text-zinc-300';
    }
  };

  const getErrorTypeIcon = (errorType) => {
    switch(errorType) {
      case 'api_404': return '🔍';
      case 'api_timeout': return '⏱️';
      case 'parse_error': return '📝';
      case 'unknown_error': return '❓';
      default: return '⚠️';
    }
  };

  const getServiceBadge = (service) => {
    switch(service) {
      case 'raiderio': return <span className="bg-orange-600 text-white px-2 py-1 rounded text-xs">Raider.IO</span>;
      case 'blizzard': return <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">Blizzard API</span>;
      default: return <span className="bg-zinc-600 text-white px-2 py-1 rounded text-xs">{service || 'Unknown'}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-zinc-300">Loading error data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-zinc-100">
      <div className="container mx-auto px-6 py-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-orange-500 mb-2">
            🚨 Sync Errors
          </h1>
          <p className="text-zinc-400 text-lg">Error tracking and diagnostics</p>
        </div>

        {/* Error Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-6 text-center">
            <div className="text-3xl font-bold text-red-400 mb-2">
              {errorData.stats.total}
            </div>
            <div className="text-zinc-400">Total Errors</div>
          </div>
          <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-6 text-center">
            <div className="text-3xl font-bold text-yellow-400 mb-2">
              {errorData.stats.last24h}
            </div>
            <div className="text-zinc-400">Last 24 Hours</div>
          </div>
          <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-6 text-center">
            <div className="text-3xl font-bold text-purple-400 mb-2">
              {errorData.stats.errorTypes?.length || 0}
            </div>
            <div className="text-zinc-400">Error Types</div>
          </div>
        </div>

        {/* Error Types Breakdown */}
        {errorData.stats.errorTypes && errorData.stats.errorTypes.length > 0 && (
          <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 p-6 mb-8">
            <h2 className="text-xl font-semibold text-zinc-100 mb-4">Error Types Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {errorData.stats.errorTypes.map((errorType, index) => (
                <div key={index} className="bg-zinc-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl mb-2">{getErrorTypeIcon(errorType.type)}</div>
                  <div className={`text-lg font-semibold ${getErrorTypeColor(errorType.type)} mb-1`}>
                    {errorType.count}
                  </div>
                  <div className="text-zinc-400 text-sm capitalize">
                    {errorType.type.replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Errors */}
        <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-700/50">
            <h2 className="text-xl font-semibold text-zinc-100">Recent Errors</h2>
            <p className="text-zinc-400 text-sm">Last 50 sync errors</p>
          </div>

          {errorData.errors.length > 0 ? (
            <div className="divide-y divide-zinc-700/50">
              {errorData.errors.map((error, index) => (
                <div key={error.id || index} className="p-6 hover:bg-zinc-700/20 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getErrorTypeIcon(error.error_type)}</span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-zinc-100">
                            {error.character_name}
                          </span>
                          {error.realm && (
                            <span className="text-zinc-500 text-sm">({error.realm})</span>
                          )}
                          {getServiceBadge(error.service)}
                        </div>
                        <div className={`text-sm font-medium ${getErrorTypeColor(error.error_type)}`}>
                          {error.error_type.replace('_', ' ').toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-zinc-500">
                      {new Date(error.timestamp).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="bg-zinc-900/50 rounded-lg p-3 mb-3">
                    <div className="text-sm text-zinc-300 font-mono">
                      {error.error_message}
                    </div>
                  </div>
                  
                  {error.url_attempted && (
                    <div className="text-xs text-zinc-500">
                      <span className="font-medium">URL:</span> 
                      <span className="font-mono ml-1 break-all">{error.url_attempted}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4">🎉</div>
              <p className="text-zinc-400 text-lg">No sync errors found!</p>
              <p className="text-zinc-500 text-sm mt-2">
                Your guild sync is running smoothly without any errors.
              </p>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <div className="text-center mt-8">
          <button
            onClick={fetchErrors}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            🔄 Refresh Error Data
          </button>
        </div>

      </div>
    </div>
  );
}

export default Errors;