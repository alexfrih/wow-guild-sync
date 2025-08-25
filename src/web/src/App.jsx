import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Castle, AlertTriangle } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Errors from './pages/Errors';

function App() {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="bg-zinc-950 text-zinc-100 min-h-screen">
      {/* Navigation Header */}
      <nav className="bg-zinc-900 border-b border-zinc-800 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 text-orange-500 hover:text-orange-400 transition-colors">
              <Castle className="w-8 h-8" />
              <h1 className="text-2xl font-bold">Pool Party Sync</h1>
            </Link>
            
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                  isActive('/') || location.pathname === '/'
                    ? 'bg-orange-600 text-zinc-900'
                    : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                }`}
              >
                <Castle className="w-4 h-4" />
                Dashboard
              </Link>
              
              
              <Link
                to="/errors"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                  isActive('/errors')
                    ? 'bg-orange-600 text-zinc-900'
                    : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Errors
              </Link>
              
              <a
                href="/api/members"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors duration-200"
              >
                📊 API
              </a>
              
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors duration-200"
              >
                📖 Docs
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/errors" element={<Errors />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;