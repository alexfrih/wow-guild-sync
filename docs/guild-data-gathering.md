# Guild Data Gathering Process

## Overview
This document explains how to gather guild member data from Blizzard's Battle.net API.

## API Endpoint
```
GET https://{region}.api.blizzard.com/data/wow/guild/{realm-slug}/{guild-slug}/roster
```

### Parameters
- `{region}`: API region (`us`, `eu`, `kr`, `tw`, `cn`)
- `{realm-slug}`: Realm slug (lowercase, hyphenated)
- `{guild-slug}`: Guild name slug (lowercase, spaces replaced with hyphens)
- `namespace=profile-{region}`: Required namespace parameter
- `locale=en_US`: Optional locale parameter

### Authentication
Requires Bearer token from OAuth2 client credentials flow:
```
POST https://oauth.battle.net/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(client_id:client_secret)}

grant_type=client_credentials
```

## Example Request
```bash
curl -H "Authorization: Bearer {token}" \
"https://eu.api.blizzard.com/data/wow/guild/archimonde/pool-party/roster?namespace=profile-eu&locale=en_US"
```

## Response Structure

### Root Response
```json
{
  "members": [
    {
      "character": { ... },
      "rank": 4
    }
  ],
  "guild": {
    "key": { "href": "..." },
    "name": "Pool Party",
    "id": 12345,
    "realm": {
      "key": { "href": "..." },
      "name": "Archimonde",
      "id": 539,
      "slug": "archimonde"
    },
    "faction": { "type": "ALLIANCE" }
  }
}
```

### Character Object (Important Fields)
```json
{
  "character": {
    "key": {
      "href": "https://eu.api.blizzard.com/profile/wow/character/ysondre/krabs?namespace=profile-eu"
    },
    "name": "Krabs",
    "id": 48367883,
    "realm": {
      "key": { "href": "..." },
      "id": 1335,
      "slug": "ysondre"
    },
    "level": 80,
    "playable_class": {
      "key": { "href": "..." },
      "id": 5
    },
    "playable_race": {
      "key": { "href": "..." },
      "id": 3
    },
    "faction": {
      "type": "ALLIANCE"
    }
  },
  "rank": 4
}
```

## Key Data Points to Extract

### Essential Fields
1. **Character Name**: `character.name` - Display name (may contain special characters)
2. **Character ID**: `character.id` - Unique character identifier
3. **Realm Slug**: `character.realm.slug` - Actual realm slug for API calls
4. **Character API URL**: `character.key.href` - **CRITICAL: Use this for individual character lookups**
5. **Level**: `character.level` - Current character level
6. **Class ID**: `character.playable_class.id` - Class identifier
7. **Guild Rank**: `rank` - Guild rank number

### Why Character API URL is Critical
- Characters in the same guild can be on **different connected realms**
- Example: Guild "Pool Party" on "Archimonde" contains characters from:
  - `ysondre` realm
  - `rashgarroth` realm  
  - `archimonde` realm
- Manual URL construction fails for cross-realm characters
- **Always use `character.key.href` for individual character API calls**

## Data Processing Rules

### Filtering Invalid Entries
```javascript
members.filter(member => 
  member.character?.name && 
  member.character?.realm?.name
)
```

### Recommended Data Structure
```javascript
{
  name: member.character.name,              // Display name
  realm: member.character.realm.slug,      // Realm slug for reference
  level: member.character.level,           // Character level
  class_id: member.character.playable_class?.id || null,
  character_api_url: member.character.key?.href,  // ESSENTIAL for lookups
  character_id: member.character.id,       // Unique identifier
  guild_rank: member.rank                  // Guild rank
}
```

## Common Issues

### 1. Guild Name Encoding
- Spaces in guild names must be replaced with hyphens
- Special characters need proper URL encoding
- Example: "Pool Party" becomes "pool-party"

### 2. Realm Assumptions
- **NEVER assume all guild members are on the same realm**
- Always use `character.realm.slug` from the API response
- Connected realms appear as separate entries in guild rosters

### 3. Character Name Encoding
- Display names (`character.name`) may contain special characters
- Do not use display names for manual API URL construction
- Always prefer `character.key.href` for API calls

### 4. Rate Limiting
- Blizzard API has rate limits
- Implement delays between requests (recommended: 1500ms)
- Monitor for 429 responses and implement backoff

## Error Handling
- Handle network timeouts gracefully
- Invalid guild names return 404
- Missing authentication returns 401
- Rate limit exceeded returns 429

## Next Steps
After gathering guild data, use `character.key.href` URLs for individual character data retrieval as documented in `character-data-gathering.md`.