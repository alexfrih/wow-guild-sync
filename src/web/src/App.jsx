import React, { useState, useEffect } from 'react';
import { Castle, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

function App() {
  const [members, setMembers] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState(() => 
    localStorage.getItem('wowGuildSortColumn') || 'item_level'
  );
  const [sortDirection, setSortDirection] = useState(() => 
    localStorage.getItem('wowGuildSortDirection') || 'desc'
  );

  const getClassColor = (className) => {
    const classColors = {
      'Warrior': 'text-[#c79c6e]',
      'Paladin': 'text-[#f58cba]', 
      'Hunter': 'text-[#abd473]',
      'Rogue': 'text-[#fff569]',
      'Priest': 'text-white',
      'Death Knight': 'text-[#c41f3b]',
      'Shaman': 'text-[#0070de]',
      'Mage': 'text-[#69ccf0]',
      'Warlock': 'text-[#9482c9]',
      'Monk': 'text-[#00ff96]',
      'Druid': 'text-[#ff7d0a]',
      'Demon Hunter': 'text-[#a330c9]',
      'Evoker': 'text-[#33937f]'
    };
    return classColors[className] || 'text-zinc-400';
  };

  const getItemLevelColor = (itemLevel) => {
    if (!itemLevel || itemLevel === '-') return 'text-zinc-400';
    const ilvl = parseInt(itemLevel);
    if (ilvl >= 700) return 'text-[#ff8000]'; // legendary
    if (ilvl >= 650) return 'text-[#a335ee]'; // epic
    if (ilvl >= 600) return 'text-[#0070dd]'; // rare
    if (ilvl >= 500) return 'text-[#1eff00]'; // uncommon
    return 'text-white';
  };

  const getMythicPlusColor = (score) => {
    if (!score || score === 0) return 'text-zinc-500';
    if (score >= 3000) return 'text-[#ff8000]'; // legendary
    if (score >= 2500) return 'text-[#a335ee]'; // epic
    if (score >= 2000) return 'text-[#0070dd]'; // rare
    if (score >= 1500) return 'text-[#1eff00]'; // uncommon
    return 'text-white';
  };

  const sortMembers = (members, column, direction) => {
    return [...members].sort((a, b) => {
      let valueA, valueB;
      
      switch(column) {
        case 'character_name':
          valueA = (a.character_name || '').toLowerCase();
          valueB = (b.character_name || '').toLowerCase();
          break;
        case 'class':
          valueA = (a.class || 'Unknown').toLowerCase();
          valueB = (b.class || 'Unknown').toLowerCase();
          break;
        case 'level':
          valueA = parseInt(a.level) || 0;
          valueB = parseInt(b.level) || 0;
          break;
        case 'item_level':
          valueA = parseInt(a.item_level) || 0;
          valueB = parseInt(b.item_level) || 0;
          break;
        case 'mythic_plus_score':
          valueA = parseInt(a.mythic_plus_score) || 0;
          valueB = parseInt(b.mythic_plus_score) || 0;
          break;
        case 'last_updated':
          valueA = new Date(a.last_updated || 0).getTime();
          valueB = new Date(b.last_updated || 0).getTime();
          break;
        default:
          return 0;
      }
      
      if (direction === 'asc') {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      } else {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      }
    });
  };

  const handleSort = (column) => {
    let newDirection;
    if (sortColumn === column) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      newDirection = ['level', 'item_level', 'mythic_plus_score', 'last_updated'].includes(column) ? 'desc' : 'asc';
    }
    
    setSortColumn(column);
    setSortDirection(newDirection);
    
    localStorage.setItem('wowGuildSortColumn', column);
    localStorage.setItem('wowGuildSortDirection', newDirection);
  };

  const getSortIcon = (column) => {
    if (sortColumn !== column) {
      return <ChevronsUpDown className="w-4 h-4 text-zinc-500 ml-1" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-zinc-300 ml-1" />
      : <ChevronDown className="w-4 h-4 text-zinc-300 ml-1" />;
  };

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/members');
      if (!response.ok) throw new Error('Failed to fetch members');
      
      const data = await response.json();
      setMembers(data.members || []);
      setMemberCount(data.count || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    const interval = setInterval(fetchMembers, 30000); // Auto-refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const sortedMembers = sortMembers(members, sortColumn, sortDirection);

  return (
    <div className="bg-zinc-950 text-zinc-100 min-h-screen">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl">
          {/* Header */}
          <div className="border-b border-zinc-800 p-6">
            <h1 className="text-3xl font-bold text-center text-[#ff8000] mb-4 flex items-center justify-center gap-3">
              <Castle className="w-8 h-8" />
              Pool Party Sync Dashboard
            </h1>
            <div className="flex justify-center gap-4">
              <button 
                className="bg-[#ff8000] hover:bg-orange-600 text-zinc-900 font-semibold px-6 py-2 rounded-lg transition-colors duration-200 flex items-center gap-2"
                onClick={fetchMembers}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh Data
              </button>
              <a 
                href="/api/members" 
                target="_blank"
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-semibold px-6 py-2 rounded-lg transition-colors duration-200 flex items-center gap-2"
              >
                JSON API
              </a>
              <a 
                href="/api/docs" 
                target="_blank"
                className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-semibold px-6 py-2 rounded-lg transition-colors duration-200 flex items-center gap-2"
              >
                API Docs
              </a>
            </div>
          </div>
          
          {/* Stats */}
          <div className="p-6 border-b border-zinc-800">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
                <h3 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Total Members</h3>
                <p className="text-2xl font-bold text-[#ff8000] mt-2">{memberCount}</p>
              </div>
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
                <h3 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Server</h3>
                <p className="text-2xl font-bold text-[#a335ee] mt-2">Archimonde</p>
              </div>
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
                <h3 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Region</h3>
                <p className="text-2xl font-bold text-[#0070dd] mt-2">EU</p>
              </div>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12 text-zinc-400">
                <div className="animate-pulse">Loading guild members...</div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-4">
                  Error loading data: {error}
                </div>
              </div>
            ) : sortedMembers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th 
                        className="text-left py-3 px-4 text-zinc-300 font-semibold cursor-pointer hover:text-[#ff8000] transition-colors duration-150"
                        onClick={() => handleSort('character_name')}
                      >
                        <div className="flex items-center">
                          Character Name
                          {getSortIcon('character_name')}
                        </div>
                      </th>
                      <th 
                        className="text-left py-3 px-4 text-zinc-300 font-semibold cursor-pointer hover:text-[#ff8000] transition-colors duration-150"
                        onClick={() => handleSort('class')}
                      >
                        <div className="flex items-center">
                          Class
                          {getSortIcon('class')}
                        </div>
                      </th>
                      <th 
                        className="text-left py-3 px-4 text-zinc-300 font-semibold cursor-pointer hover:text-[#ff8000] transition-colors duration-150"
                        onClick={() => handleSort('level')}
                      >
                        <div className="flex items-center">
                          Level
                          {getSortIcon('level')}
                        </div>
                      </th>
                      <th 
                        className="text-left py-3 px-4 text-zinc-300 font-semibold cursor-pointer hover:text-[#ff8000] transition-colors duration-150"
                        onClick={() => handleSort('item_level')}
                      >
                        <div className="flex items-center">
                          Item Level
                          {getSortIcon('item_level')}
                        </div>
                      </th>
                      <th 
                        className="text-left py-3 px-4 text-zinc-300 font-semibold cursor-pointer hover:text-[#ff8000] transition-colors duration-150"
                        onClick={() => handleSort('mythic_plus_score')}
                      >
                        <div className="flex items-center">
                          M+ Score
                          {getSortIcon('mythic_plus_score')}
                        </div>
                      </th>
                      <th 
                        className="text-left py-3 px-4 text-zinc-300 font-semibold cursor-pointer hover:text-[#ff8000] transition-colors duration-150"
                        onClick={() => handleSort('last_updated')}
                      >
                        <div className="flex items-center">
                          Last Updated
                          {getSortIcon('last_updated')}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMembers.map((member, index) => (
                      <tr key={`${member.character_name}-${member.realm}`} className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors duration-150">
                        <td className="py-3 px-4">
                          <span className="font-bold text-zinc-100">{member.character_name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`${getClassColor(member.class)} font-medium`}>
                            {member.class || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-zinc-200">{member.level || '-'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`${getItemLevelColor(member.item_level)} font-semibold`}>
                            {member.item_level || '-'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`${getMythicPlusColor(member.mythic_plus_score)} font-semibold`}>
                            {member.mythic_plus_score || '0'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-zinc-400 text-sm">
                            {member.last_updated ? new Date(member.last_updated).toLocaleString() : '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-4">
                  No guild members found.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;