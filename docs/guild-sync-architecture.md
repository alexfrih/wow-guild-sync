# Guild Sync Architecture

## Overview
This document explains the two-tier synchronization architecture used to efficiently manage guild member data, activity tracking, and performance optimization.

## Architecture Design

The system uses a **two-tier sync approach** to minimize API calls and optimize performance:

1. **Guild Discovery** (every 6 hours) - Full roster sync with membership and activity tracking
2. **Active Character Sync** (every hour) - Performance sync for recently active players only

## Tier 1: Guild Discovery (6-hour cycle)

### Purpose
- Maintain accurate guild membership roster
- Track member joins/departures  
- Monitor character activity status
- Identify inactive/deleted characters

### Process Flow

#### 1. Fetch Guild Roster
```javascript
// ExternalApiService.getMembers()
GET https://eu.api.blizzard.com/data/wow/guild/archimonde/pool-party/roster
```
- Retrieves all guild members (typically ~270 characters)
- Extracts character names, realms, levels, classes, and **critical API URLs**
- Uses `character.key.href` for cross-realm character support

#### 2. Membership Change Detection
```javascript
// GuildSyncService.handleMembershipChanges()
const currentMembers = guildRosterResponse.map(m => m.character.name);
const existingMembers = await prisma.getAllMemberNames();
const newMembers = currentMembers.filter(name => !existingMembers.includes(name));
const departedMembers = existingMembers.filter(name => !currentMembers.includes(name));
```
- Compares current roster with database
- Identifies new guild members (joins)
- Identifies departed members (leaves/kicks)
- Removes departed members from database

#### 3. Activity Status Monitoring
```javascript
// ExternalApiService.bulkCheckActivity()
for (character in allGuildMembers) {
  const activityData = await getLastLoginTimestamp(character);
  // Returns: { last_login_timestamp, activity_status, days_since_login }
}
```
- Checks `last_login_timestamp` for all characters via Blizzard API
- Classifies activity status:
  - **active**: ≤7 days since login
  - **casual**: 8-30 days since login  
  - **inactive**: >30 days since login
  - **unknown**: API returns no timestamp (character may be deleted/transferred)

#### 4. Database Updates
```javascript
// PrismaService.bulkUpdateActivityStatus()
await prisma.guildMember.upsert({
  where: { character_name_realm: { character_name, realm } },
  update: { 
    last_login_timestamp, 
    activity_status, 
    last_activity_check: new Date()
  }
});
```
- Updates activity data for all guild members
- Maintains historical tracking via `last_activity_check`
- Handles 404 errors gracefully (sets status to 'unknown')

### Performance Impact
- **API Calls**: ~270 character activity checks + 1 guild roster call
- **Frequency**: Every 6 hours (4 times per day)
- **Total Daily API Calls**: ~1,084 calls

## Tier 2: Active Character Sync (1-hour cycle)

### Purpose
- Keep performance data fresh for active players
- Minimize API calls by focusing on recently active characters
- Provide up-to-date item levels, M+ scores, PvP ratings

### Active Character Filtering
```javascript
// PrismaService.getActiveCharacters(14)
const cutoffTimestamp = Date.now() - (14 * 24 * 60 * 60 * 1000);
return await prisma.guildMember.findMany({
  where: {
    last_login_timestamp: { gte: cutoffTimestamp }
  }
});
```
- Only syncs characters who logged in within **last 14 days**
- Typically reduces sync population from 270 to ~60-100 characters
- Excludes inactive/unknown status characters

### Data Sources
The system uses multiple APIs to gather comprehensive character data:

#### Raider.IO (Primary)
```javascript
// ExternalApiService.getMemberFromRaiderIO()
GET https://raider.io/api/v1/characters/profile?region=eu&realm=archimonde&name=Krabs&fields=gear,mythic_plus_scores_by_season:current
```
- **Strengths**: Mythic+ scores, gear item levels, no authentication required
- **Limitations**: Max level assumption (80), no PvP data, some characters not tracked

#### Blizzard API (Fallback)
```javascript
// ExternalApiService.getMemberFromBlizzard()
GET https://eu.api.blizzard.com/profile/wow/character/ysondre/krabs
```
- **Strengths**: Official data, PvP ratings, accurate levels, cross-realm support
- **Limitations**: No M+ scores, requires OAuth2 authentication, rate limits

### Sync Strategy
```javascript
// Auto-fallback approach
try {
  return await getMemberFromRaiderIO(name, realm, region);
} catch (raiderIOError) {
  logger.info(`Raider.IO failed for ${name}, trying Blizzard API`);
  return await getMemberFromBlizzard(name, realm, region, characterApiUrl);
}
```

### Performance Impact
- **API Calls**: ~60-100 character performance calls (much lower than 270)
- **Frequency**: Every hour (24 times per day)  
- **Total Daily API Calls**: ~1,440-2,400 calls (vs 6,480 if syncing all characters)
- **Performance Improvement**: ~60-70% reduction in API calls

## Database Schema

### Core Tables

#### guild_members
```sql
CREATE TABLE guild_members (
  id INTEGER PRIMARY KEY,
  character_name TEXT NOT NULL,
  realm TEXT NOT NULL,
  class TEXT,
  level INTEGER,
  item_level REAL,
  mythic_plus_score REAL,
  current_pvp_rating INTEGER DEFAULT 0,
  last_login_timestamp BIGINT,           -- Unix timestamp from Blizzard API
  activity_status TEXT DEFAULT 'unknown', -- 'active', 'casual', 'inactive', 'unknown'
  last_activity_check DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(character_name, realm)
);
```

#### sync_errors
```sql
CREATE TABLE sync_errors (
  id INTEGER PRIMARY KEY,
  character_name TEXT NOT NULL,
  realm TEXT,
  error_type TEXT NOT NULL,    -- 'api_404', 'api_timeout', 'parse_error'
  error_message TEXT NOT NULL,
  service TEXT NOT NULL,       -- 'raiderio' or 'blizzard'
  url_attempted TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Error Handling & Resilience

### Common Scenarios

#### 404 Errors
- **Cause**: Character deleted/transferred, realm connections changed
- **Detection**: API returns 404 during activity check or performance sync
- **Action**: Log error, set activity_status to 'unknown', exclude from active sync
- **Recovery**: Character reappears in guild roster during next discovery cycle

#### API Rate Limits
- **Detection**: 429 response codes
- **Action**: Exponential backoff, delay between requests (200ms default)
- **Recovery**: Retry failed requests in next sync cycle

#### Cross-Realm Issues  
- **Cause**: Manual URL construction for characters on different connected realms
- **Solution**: Always use `character.key.href` from guild roster response
- **Prevention**: ExternalApiService automatically handles cross-realm URLs

## Monitoring & Observability

### Real-time Logging
- Socket.IO integration for live sync progress updates
- Character-level success/failure tracking
- Performance metrics per sync cycle

### Error Analytics
```javascript
// PrismaService.getErrorStats()
{
  total: 150,
  last24h: 45,
  errorTypes: [
    { type: 'api_404', count: 97 },
    { type: 'api_timeout', count: 8 },
    { type: 'parse_error', count: 2 }
  ]
}
```

### Activity Distribution
- **Active (≤7 days)**: ~40-60 characters
- **Casual (8-30 days)**: ~20-30 characters  
- **Inactive (>30 days)**: ~80-120 characters
- **Unknown (404s)**: ~60-100 characters (deleted/transferred)

## Configuration

### Environment Variables
```bash
GUILD_NAME=Pool Party
GUILD_REALM=Archimonde
GUILD_REGION=eu
BLIZZARD_CLIENT_ID=...
BLIZZARD_CLIENT_SECRET=...
```

### Scheduling (Cron Jobs)
```javascript
// Guild Discovery: Every 6 hours
cron.schedule('0 */6 * * *', () => guildService.runGuildDiscovery());

// Active Character Sync: Every hour  
cron.schedule('0 * * * *', () => guildService.runActiveCharacterSync());
```

## Performance Benefits

### API Call Optimization
- **Before**: 270 characters × 24 hours = 6,480 daily API calls
- **After**: (270 × 4) + (80 × 24) = 3,000 daily API calls (~54% reduction)

### Resource Efficiency
- Reduced server load during hourly syncs
- Faster completion times for active data updates
- Better user experience with more frequent fresh data for active players

### Scalability
- Architecture scales with guild size
- Inactive player growth doesn't impact hourly sync performance
- Easy to adjust activity thresholds (14-day window configurable)