# WoW Guild Sync - API Endpoints Documentation

This document lists all external API endpoints used by the WoW Guild Sync application.

## 🏆 Blizzard Battle.net API

### Authentication
- **POST** `https://oauth.battle.net/token`
  - **Purpose**: Get OAuth2 access token
  - **Credentials**: Client ID + Client Secret
  - **Used for**: All Blizzard API calls

### Guild Data
- **GET** `https://{region}.api.blizzard.com/data/wow/guild/{realm-slug}/{guild-name-slug}/roster`
  - **Purpose**: Get current guild member list
  - **Namespace**: `profile-{region}`
  - **Returns**: List of current guild members with basic info
  - **Used for**: Guild discovery sync

### Character Profile Data
- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}`
  - **Purpose**: Get character basic info (level, class, item level, active spec)
  - **Namespace**: `profile-{region}`
  - **Returns**: Character class, level, equipped item level, active specialization
  - **Used for**: Character data sync, Solo Shuffle spec detection

### Achievement Data
- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/achievements`
  - **Purpose**: Get character achievement points
  - **Namespace**: `profile-{region}`
  - **Returns**: `total_points` field
  - **Used for**: Achievement points sync

### PvP Bracket Data
- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/pvp-bracket/2v2`
  - **Purpose**: Get 2v2 Arena rating
  - **Namespace**: `profile-{region}`
  - **Returns**: Current rating, season info, match statistics
  - **Season**: Current season (Season 40)

- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/pvp-bracket/3v3`
  - **Purpose**: Get 3v3 Arena rating
  - **Namespace**: `profile-{region}`
  - **Returns**: Current rating, season info, match statistics
  - **Season**: Current season (Season 40)

- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/pvp-bracket/rbg`
  - **Purpose**: Get traditional Rated Battlegrounds rating
  - **Namespace**: `profile-{region}`
  - **Returns**: Current rating, season info, match statistics (if available)
  - **Season**: Current season (Season 40)

- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/pvp-bracket/shuffle-{class}-{spec}`
  - **Purpose**: Get Solo Shuffle rating for specific class/spec combination
  - **Namespace**: `profile-{region}`
  - **Returns**: Current rating, season best rating, match/round statistics
  - **Season**: Current season (Season 40)
  - **Example**: `shuffle-paladin-holy`, `shuffle-warrior-fury`

- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/pvp-bracket/blitz-{class}-{spec}`
  - **Purpose**: Get RBG Blitz (RBG Shuffle) rating for specific class/spec combination
  - **Namespace**: `profile-{region}`
  - **Returns**: Current rating, season info, match statistics
  - **Season**: Current season (Season 40)
  - **Example**: `blitz-paladin-holy`, `blitz-warrior-fury`

### PvP Summary
- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}/pvp-summary`
  - **Purpose**: Get all available PvP brackets for a character
  - **Namespace**: `profile-{region}`
  - **Returns**: List of all bracket URLs, honor level, battleground statistics
  - **Used for**: Discovering Solo Shuffle and RBG Blitz brackets across all specs

### Activity Tracking
- **GET** `https://{region}.api.blizzard.com/profile/wow/character/{realm-slug}/{character-name}`
  - **Purpose**: Get character last login timestamp
  - **Namespace**: `profile-{region}`
  - **Returns**: `last_login_timestamp` field
  - **Used for**: Activity status determination (active/inactive)

### Season Information
- **GET** `https://{region}.api.blizzard.com/data/wow/pvp-season/{season-id}`
  - **Purpose**: Get PvP season details
  - **Namespace**: `dynamic-{region}`
  - **Returns**: Season name, start timestamp, leaderboards, rewards
  - **Current Season**: 40 ("The War Within Season 3")

## 🎯 Raider.IO API

### Character Profile
- **GET** `https://raider.io/api/v1/characters/profile`
  - **Parameters**: `region`, `realm`, `name`, `fields`
  - **Fields Used**: `mythic_plus_scores_by_season:current`, `raid_progression`
  - **Purpose**: Get Mythic+ scores and raid progression
  - **Returns**: Current season M+ score, raid progression data
  - **Used for**: M+ and raid data sync

## 📊 Data Mapping

### Character Data Sources
| Field | Primary Source | Fallback Source |
|-------|---------------|----------------|
| **Character Class** | Blizzard Profile API | Guild Roster |
| **Level** | Blizzard Profile API | Guild Roster |
| **Item Level** | Blizzard Profile API | - |
| **Mythic+ Score** | Raider.IO API | - |
| **Raid Progress** | Raider.IO API | - |
| **Achievement Points** | Blizzard Achievements API | - |
| **2v2 Rating** | Blizzard PvP Bracket API | - |
| **3v3 Rating** | Blizzard PvP Bracket API | - |
| **RBG Rating** | Blizzard PvP Bracket API | - |
| **Solo Shuffle Rating** | Blizzard PvP Summary + Brackets | - |
| **RBG Blitz Rating** | Blizzard PvP Summary + Brackets | - |
| **Activity Status** | Blizzard Profile API | - |

### PvP Season Validation
- All PvP ratings are validated to be from **Season 40** ("The War Within Season 3")
- Season start: January 2025 (timestamp: 1755057600000)
- Both current ratings and season statistics are tracked

## 🔄 Sync Frequency

### Guild Discovery Sync
- **Frequency**: Every 6 hours
- **Purpose**: Discover new/removed guild members
- **APIs Used**: Blizzard Guild Roster, Blizzard Activity Check

### Active Character Sync  
- **Frequency**: Every 30 minutes
- **Purpose**: Update data for active members (logged in within 30 days)
- **APIs Used**: Raider.IO Profile, Blizzard Achievements, Blizzard PvP APIs

### Missing Data Sync
- **Frequency**: As needed
- **Purpose**: Fill in missing achievement/PvP data for active members
- **APIs Used**: Blizzard Achievements, Blizzard PvP APIs

## 🏷️ Current Season Info
- **Season ID**: 40
- **Season Name**: "Player vs. Player (The War Within Season 3)"
- **Start Date**: January 2025
- **All PvP ratings are current season ratings**

## 🚨 Rate Limiting
- **Blizzard API**: ~1.5 second delays between character requests
- **Raider.IO**: ~300ms delays between requests
- **Concurrent Requests**: Limited to avoid rate limiting

## 🔐 Authentication
- **Blizzard API**: OAuth2 Client Credentials flow
- **Raider.IO**: No authentication required (public API)