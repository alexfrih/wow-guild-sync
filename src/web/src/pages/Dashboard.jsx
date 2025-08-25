import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { AlertTriangle, ExternalLink } from 'lucide-react';

function Dashboard() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    fetchMembers();
    fetchErrors();
    
    const socket = io();
    
    socket.on('membersUpdated', (data) => {
      console.log('🔄 Members updated via Socket.IO:', data);
      setMembers(data.members);
      setLastSync(data.lastSync);
    });

    socket.on('syncProgress', (data) => {
      console.log('📊 Sync progress update:', data);
      setSyncProgress(data);
    });

    socket.on('syncComplete', (data) => {
      console.log('✅ Sync completed:', data);
      setSyncProgress(null);
      // Refresh errors after sync completes
      fetchErrors();
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

  const fetchErrors = async () => {
    try {
      const response = await fetch('/api/errors?limit=50');
      const data = await response.json();
      setErrors(data.errors || []);
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    }
  };

  const hasRecentError = (characterName) => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    return errors.some(error => 
      error.character_name === characterName && 
      new Date(error.timestamp) > recent
    );
  };

  const getArmoryLink = (characterName, realm) => {
    return `https://worldofwarcraft.blizzard.com/en-us/character/eu/${realm}/${characterName}`;
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
          <p className="text-zinc-400 text-lg">Archimonde - EU</p>
          <div className="mt-4 flex justify-center space-x-4 text-sm">
            <span className="bg-zinc-800 px-3 py-1 rounded">
              <span className="text-zinc-400">Members:</span>{' '}
              <span className="text-orange-500 font-semibold">{members.length}</span>
            </span>
            {syncProgress && (
              <span className="bg-blue-900/50 px-3 py-1 rounded border border-blue-700">
                <span className="text-blue-400">Syncing:</span>{' '}
                <span className="text-blue-300 font-semibold">
                  {syncProgress.current}/{syncProgress.total}
                </span>
                {syncProgress.character && (
                  <span className="text-zinc-400"> - {syncProgress.character}</span>
                )}
                {syncProgress.errors > 0 && (
                  <span className="text-red-400"> ({syncProgress.errors} errors)</span>
                )}
              </span>
            )}
            {lastSync && !syncProgress && (
              <span className="bg-zinc-800 px-3 py-1 rounded">
                <span className="text-zinc-400">Last Sync:</span>{' '}
                <span className="text-green-500">{lastSync.processed} updated</span>
                {lastSync.duration && (
                  <span className="text-zinc-400"> ({lastSync.duration}s)</span>
                )}
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
                    Activity Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Achievement Points
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Item Level
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    M+ Score
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Raid Progress
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    2v2
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    3v3
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    RBG
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-300 uppercase tracking-wider">
                    Solo Shuffle
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
                      <div className="flex items-center space-x-2">
                        <div>
                          <span className="text-sm font-medium text-zinc-100">
                            {member.character_name}
                          </span>
                          <span className="ml-2 text-xs text-zinc-500">
                            {member.realm}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {hasRecentError(member.character_name) && (
                            <AlertTriangle className="w-4 h-4 text-red-400" title="Recent sync error" />
                          )}
                          <a
                            href={getArmoryLink(member.character_name, member.realm)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-orange-400 transition-colors"
                            title="View on Armory"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
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
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        member.activity_status === 'active' 
                          ? 'bg-green-900/50 text-green-400 border border-green-700/50' 
                          : 'bg-red-900/50 text-red-400 border border-red-700/50'
                      }`}>
                        {member.activity_status || 'inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.achievement_points && member.achievement_points > 0 ? (
                        <span className={`font-medium ${
                          member.achievement_points >= 30000 ? 'text-purple-400' :
                          member.achievement_points >= 20000 ? 'text-orange-400' :
                          member.achievement_points >= 15000 ? 'text-blue-400' :
                          member.achievement_points >= 10000 ? 'text-green-400' :
                          'text-zinc-400'
                        }`}>
                          {member.achievement_points.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
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
                      {member.raid_progress ? (
                        <span className="text-amber-400 font-medium">
                          {member.raid_progress}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.pvp_2v2_rating && member.pvp_2v2_rating > 0 ? (
                        <span className={`font-medium ${
                          member.pvp_2v2_rating >= 2400 ? 'text-purple-400' :
                          member.pvp_2v2_rating >= 2100 ? 'text-orange-400' :
                          member.pvp_2v2_rating >= 1800 ? 'text-blue-400' :
                          member.pvp_2v2_rating >= 1500 ? 'text-green-400' :
                          'text-zinc-400'
                        }`}>
                          {member.pvp_2v2_rating}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.pvp_3v3_rating && member.pvp_3v3_rating > 0 ? (
                        <span className={`font-medium ${
                          member.pvp_3v3_rating >= 2400 ? 'text-purple-400' :
                          member.pvp_3v3_rating >= 2100 ? 'text-orange-400' :
                          member.pvp_3v3_rating >= 1800 ? 'text-blue-400' :
                          member.pvp_3v3_rating >= 1500 ? 'text-green-400' :
                          'text-zinc-400'
                        }`}>
                          {member.pvp_3v3_rating}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.pvp_rbg_rating && member.pvp_rbg_rating > 0 ? (
                        <span className={`font-medium ${
                          member.pvp_rbg_rating >= 2400 ? 'text-purple-400' :
                          member.pvp_rbg_rating >= 2100 ? 'text-orange-400' :
                          member.pvp_rbg_rating >= 1800 ? 'text-blue-400' :
                          member.pvp_rbg_rating >= 1500 ? 'text-green-400' :
                          'text-zinc-400'
                        }`}>
                          {member.pvp_rbg_rating}
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {member.solo_shuffle_rating && member.solo_shuffle_rating > 0 ? (
                        <div className="flex flex-col">
                          <span className={`font-medium ${
                            member.solo_shuffle_rating >= 2400 ? 'text-purple-400' :
                            member.solo_shuffle_rating >= 2100 ? 'text-orange-400' :
                            member.solo_shuffle_rating >= 1800 ? 'text-blue-400' :
                            member.solo_shuffle_rating >= 1500 ? 'text-green-400' :
                            'text-zinc-400'
                          }`}>
                            {member.solo_shuffle_rating}
                          </span>
                          {member.max_solo_shuffle_rating && member.max_solo_shuffle_rating > member.solo_shuffle_rating && (
                            <span className="text-xs text-zinc-500">
                              Max: {member.max_solo_shuffle_rating}
                            </span>
                          )}
                        </div>
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