import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

function Dashboard() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    fetchMembers();
    
    const socket = io();
    
    socket.on('membersUpdated', (data) => {
      console.log('🔄 Members updated via Socket.IO:', data);
      setMembers(data.members);
      setLastSync(data.lastSync);
    });

    return () => socket.disconnect();
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await fetch('/api/members');
      const data = await response.json();
      setMembers(data.members);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      setLoading(false);
    }
  };

  const getClassColor = (className) => {
    const colors = {
      'Warrior': '#c79c6e',
      'Paladin': '#f58cba', 
      'Hunter': '#abd473',
      'Rogue': '#fff569',
      'Priest': '#ffffff',
      'Death Knight': '#c41f3b',
      'Shaman': '#0070de',
      'Mage': '#69ccf0',
      'Warlock': '#9482c9',
      'Monk': '#00ff96',
      'Druid': '#ff7d0a',
      'Demon Hunter': '#a330c9',
      'Evoker': '#33937f'
    };
    return colors[className] || '#ffffff';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-zinc-300">Loading guild members...</p>
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
            🏰 Pool Party Guild
          </h1>
          <p className="text-zinc-400 text-lg">Archimonde - US</p>
          <div className="mt-4 flex justify-center space-x-4 text-sm">
            <span className="bg-zinc-800 px-3 py-1 rounded">
              <span className="text-zinc-400">Members:</span>{' '}
              <span className="text-orange-500 font-semibold">{members.length}</span>
            </span>
            {lastSync && (
              <span className="bg-zinc-800 px-3 py-1 rounded">
                <span className="text-zinc-400">Last Sync:</span>{' '}
                <span className="text-green-500">{lastSync.processed} updated</span>
                {lastSync.errors > 0 && (
                  <span className="text-red-400"> ({lastSync.errors} errors)</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-zinc-800/50 backdrop-blur rounded-lg border border-zinc-700/50 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-900/80">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Character
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Class
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Level
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Item Level
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    M+ Score
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    PvP Rating
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700/50">
                {members.map((member, index) => (
                  <tr key={`${member.character_name}-${member.realm}`} 
                      className="hover:bg-zinc-700/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-zinc-100">
                          {member.character_name}
                        </span>
                        <span className="ml-2 text-xs text-zinc-500">
                          {member.realm}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span 
                        className="text-sm font-medium"
                        style={{ color: getClassColor(member.class) }}
                      >
                        {member.class || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">
                      {member.level || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.item_level ? (
                        <span className={`font-medium ${
                          member.item_level >= 650 ? 'text-purple-400' :
                          member.item_level >= 620 ? 'text-blue-400' :
                          member.item_level >= 590 ? 'text-green-400' :
                          member.item_level >= 560 ? 'text-yellow-400' :
                          'text-gray-400'
                        }`}>
                          {Math.round(member.item_level)}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.mythic_plus_score ? (
                        <span className={`font-medium ${
                          member.mythic_plus_score >= 3000 ? 'text-purple-400' :
                          member.mythic_plus_score >= 2500 ? 'text-orange-400' :
                          member.mythic_plus_score >= 2000 ? 'text-blue-400' :
                          member.mythic_plus_score >= 1500 ? 'text-green-400' :
                          'text-zinc-400'
                        }`}>
                          {Math.round(member.mythic_plus_score)}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.current_pvp_rating && member.current_pvp_rating > 0 ? (
                        <span className="text-red-400 font-medium">
                          {member.current_pvp_rating}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-zinc-500">
                      {member.last_updated ? new Date(member.last_updated).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {members.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-400 text-lg">No guild members found.</p>
          </div>
        )}

      </div>
    </div>
  );
}

export default Dashboard;