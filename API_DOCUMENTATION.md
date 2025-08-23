# WoW Guild Sync API Documentation

## Overview
This document details the external APIs used by the WoW Guild Sync application to fetch player data.

## API Endpoints

### 1. Blizzard API (Battle.net)

#### Authentication
- **Token URL**: `https://oauth.battle.net/token`
- **Method**: POST
- **Auth Type**: Client Credentials (OAuth2)
- **Required**: Client ID and Client Secret

#### Character Profile
- **Endpoint**: `https://{region}.api.blizzard.com/profile/wow/character/{realm}/{character-name}`
- **Method**: GET
- **Headers**: `Authorization: Bearer {token}`
- **Parameters**: 
  - `namespace`: profile-{region}
  - `locale`: en_US
- **Data Retrieved**:
  - Character Class
  - Level
  - **Item Level** (equipped_item_level or average_item_level)
  - Active Spec

#### PvP Brackets
- **Endpoint**: `https://{region}.api.blizzard.com/profile/wow/character/{realm}/{character-name}/pvp-bracket/{bracket}`
- **Method**: GET
- **Headers**: `Authorization: Bearer {token}`
- **Brackets**: 2v2, 3v3, rbg, shuffle-{class}-{spec}
- **Data Retrieved**:
  - **Current PvP Rating**

### 2. Raider.IO API

#### Character Mythic+ Profile
- **Endpoint**: `https://raider.io/api/v1/characters/profile`
- **Method**: GET
- **Parameters**:
  - `region`: {region}
  - `realm`: {realm}
  - `name`: {character-name}
  - `fields`: mythic_plus_scores_by_season:current
- **Data Retrieved**:
  - **Mythic+ Score** (current season)
  - Season information

## Data Mapping

| UI Field | Data Source | API Endpoint | Field |
|----------|-------------|--------------|-------|
| Character Name | Input | - | - |
| Class | Raider.IO API (primary) / Blizzard API (fallback) | Character Profile | class / character_class.name |
| Level | Raider.IO (assumed 80) / Blizzard API (fallback) | Character Profile | - / level |
| **Item Level** | Raider.IO API (primary) / Blizzard API (fallback) | Character Profile with gear field | gear.item_level_equipped / equipped_item_level |
| **M+ Score** | Raider.IO API | Character M+ Profile | mythic_plus_scores_by_season[0].scores.all |
| Current PvP Rating | Blizzard API | PvP Brackets | rating (highest from all brackets including Solo Shuffle) |
| Last Updated | System | - | Current timestamp |

## Sync Process Flow (Updated)

1. **Primary Data Source - Raider.IO**: 
   - Fetch character data with `gear` and `mythic_plus_scores_by_season:current` fields
   - Extract: Class, Item Level, M+ Score
   - If successful, skip to step 3
   
2. **Fallback - Blizzard API** (only if Raider.IO fails):
   - Get OAuth token
   - Fetch character profile for basic data
   - Extract: Class, Level, Item Level

3. **PvP Data - Blizzard API** (for Solo Shuffle support):
   - Check all PvP brackets (2v2, 3v3, RBG, Solo Shuffle)
   - Take highest rating across all brackets

4. **Database Update**: Store all collected data with timestamp

## Rate Limiting

- **Blizzard API**: Configurable delay (default in config)
- **Raider.IO API**: 200ms delay between requests
- **Batch Processing**: Process characters in configurable batch sizes
- **Between Batches**: 5 second delay

## Common Issues & Solutions

### Issue: M+ Score shows as 0
**Possible Causes**:
1. Character hasn't done any M+ in current season
2. Raider.IO hasn't indexed the character yet
3. API request failed (network/timeout)
4. Incorrect character name/realm spelling

**Solution**: 
- Check if character exists on Raider.IO website
- Verify character has M+ runs in current season
- Check error logs for API failures

### Issue: Item Level shows as "-" or missing
**Possible Causes**:
1. Blizzard API authentication failed
2. Character profile is private
3. Character doesn't exist on specified realm
4. API response doesn't include item level data

**Solution**:
- Verify Blizzard API credentials are valid
- Check character exists on Blizzard armory
- Ensure character profile is not set to private
- Review API response structure for changes

### Issue: Multiple characters showing 0 for M+ Score
**Current Season**: The system fetches data for the current M+ season (TWW Season 3 as of writing). Characters who haven't participated in the current season will show 0.

## Error Handling

The sync service includes error handling for:
- API authentication failures
- Network timeouts
- Missing data fields
- Rate limit violations
- Invalid character names/realms

Failed syncs are logged but don't stop the batch process, allowing other characters to sync successfully.