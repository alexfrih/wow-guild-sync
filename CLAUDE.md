# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WoW Guild Sync is an autonomous synchronization service that fetches World of Warcraft guild member data from Blizzard and Raider.io APIs, stores it in a SQLite database (Prisma), and optionally pushes updates to an external web API. It runs on a two-tier cron system: hourly syncs for active characters and periodic full guild discoveries.

**Core Architecture:**
- **GuildSyncService**: Main orchestrator managing the two-tier sync system
- **ExternalApiService**: Handles all external API calls (Blizzard OAuth, Guild Roster, Character/PvP/M+ data from Raider.io and Blizzard)
- **PrismaService**: Database abstraction layer for SQLite operations
- **WebApiService**: Optional integration to push synced data to external endpoints
- **EmailService**: Mailgun integration for error notifications
- **HealthServer**: Express server providing health checks and serving the React dashboard

**Two-Tier Sync System:**
1. **Guild Discovery** (every 6 hours): Discovers new members, updates activity status based on last login timestamps
2. **Active Character Sync** (every 30 minutes): Deep sync for recently active members (item level, M+ score, PvP ratings, achievements, raid progress)

## Recent Changes (2025-11)

**Database Migration: PostgreSQL → SQLite**
- Migrated from external PostgreSQL (Neon) to local SQLite for simplified deployment and better performance
- Database file location: `./data/guild-sync.db` (persisted via Docker volume)
- `docker-compose.yml` explicitly sets `DATABASE_URL=file:/app/data/guild-sync.db` to override any stale environment variables
- Dockerfile includes `--accept-data-loss` flag for automatic schema migrations during container startup
- Deploy script (`deploy.sh`) now includes automatic SQLite database backups before each deployment (keeps last 5 backups)

**Schema Changes:**
- Replaced `is_active` boolean column with `activity_status` string field ('active'/'inactive')
- Activity status is automatically re-synced from Blizzard API on next sync cycle
- Prisma automatically handles schema migrations on container startup with data loss acceptance

**Production Deployment Notes:**
- Ensure `.env` file on production server has `DATABASE_URL=file:/app/data/guild-sync.db`
- Run `git pull && ./deploy.sh` to deploy with automatic backups
- Database persists in `./data/` directory on host machine
- Old backups are automatically cleaned up (keeps 5 most recent)

## Development Commands

**Local Development:**
```bash
# Start with auto-rebuild on code changes
docker-compose up --watch

# Restart containers after config changes
docker-compose down && docker-compose up -d

# View logs
docker-compose logs -f

# Check health
curl http://localhost:3001/health
```

**Node Scripts:**
```bash
npm run dev              # Run with --watch flag (auto-restart)
npm start                # Run normally
npm run health           # Run health check script
npm run compose:up       # Docker compose up -d
npm run compose:down     # Docker compose down
npm run compose:logs     # Docker compose logs -f
```

**Production Deployment:**
```bash
./deploy.sh              # Handles frontend build, SQLite backups, Docker rebuild, health checks
                         # Automatically backs up database before deployment (keeps last 5)
```

**Database:**
```bash
npx prisma generate      # Generate Prisma client
npx prisma db push       # Push schema changes to SQLite database
npx prisma studio        # Open Prisma Studio GUI
```

## Configuration

Required environment variables (`.env`):
- `GUILD_NAME`, `GUILD_REALM`, `GUILD_REGION` - Guild identification
- `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET` - OAuth credentials from https://develop.battle.net/
- `DATABASE_URL` - SQLite database file path (e.g., `file:/app/data/guild-sync.db`)
- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `CONTACT_EMAIL` - Optional email notifications
- `WEB_API_URL`, `WEB_API_KEY` - Optional external API integration

See `src/config.js` for all configuration options and defaults.

## Key Implementation Details

**API Rate Limiting:**
- Blizzard API: 1500ms between requests
- Raider.io: 300ms between requests
- Batch processing: 40 characters per batch

**Data Sources:**
- Guild roster and character profiles: Blizzard API (requires OAuth token from `getBlizzardToken()`)
- M+ scores: Raider.io (faster, no auth required)
- PvP ratings: Blizzard API (requires current season ID via `getCurrentPvpSeasonId()`)
- Last login timestamps: Blizzard character profile API

**Activity Detection:**
- Characters are marked "active" if `last_login_timestamp` is within 7 days
- Active characters get hourly deep syncs
- Inactive characters only get basic updates during guild discovery

**PvP Rating Logic:**
- Current season ID is dynamically fetched via Blizzard's PvP Season index API
- Ratings are extracted from `pvp_summary` endpoint for 2v2, 3v3, RBG, Solo Shuffle, and RBG Shuffle brackets
- See `ExternalApiService.getPvpRatings()` and `ExternalApiService.getCurrentPvpSeasonId()` for implementation

**Error Handling:**
- Sync errors are logged to `SyncError` model with service, error type, and URL
- Recent errors are tracked in memory for email reporting
- Email notifications sent after thresholds (10 errors or 50% error rate)

## Frontend (React Dashboard)

Located in `src/web/`:
- Built with Vite + React
- Real-time updates via Socket.io
- Displays guild member stats, sync progress, and health status
- Build output: `src/web/build/` (served by HealthServer)

Build commands:
```bash
cd src/web
npm install
npm run build
```

## Database Schema

**GuildMember**: Primary model storing character data
- Core fields: `character_name`, `realm`, `class`, `level`, `item_level`
- PvP ratings: `pvp_2v2_rating`, `pvp_3v3_rating`, `pvp_rbg_rating`, `solo_shuffle_rating`, `rbg_shuffle_rating`
- M+ data: `mythic_plus_score`, `current_saison`
- Activity tracking: `activity_status` ('active'/'inactive'), `last_login_timestamp`, `last_activity_check`, `last_hourly_check`
- Other: `achievement_points`, `raid_progress` (JSON string)
- Unique constraint: `[character_name, realm]`

**SyncLog**: Sync operation history (timestamp, status, message, character_name)

**SyncError**: Detailed error tracking for API failures (character_name, realm, error_type, service, url_attempted, timestamp)

**DatabaseVersion**: Migration tracking (version, applied_at, description)

## Common Patterns

**Adding a new external API call:**
1. Add method to `ExternalApiService` with proper error handling
2. Respect rate limits using `await this.sleep(ms)`
3. Log errors to `SyncError` model via `logSyncError()`
4. Update `GuildSyncService` to call the new method in appropriate sync phase

**Adding a new field to GuildMember:**
1. Update Prisma schema in `prisma/schema.prisma`
2. Run `npx prisma db push --accept-data-loss` to apply changes to SQLite database (use --accept-data-loss for breaking changes)
3. Update `ExternalApiService` to fetch the data
4. Update `GuildSyncService` to process and store the data
5. Regenerate Prisma client: `npx prisma generate`
6. Note: Docker container automatically runs `npx prisma db push --accept-data-loss` on startup

**Debugging sync issues:**
1. Check logs: `docker-compose logs -f`
2. Check health endpoint: `http://localhost:3001/health`
3. Review recent errors in database: `SELECT * FROM sync_errors ORDER BY timestamp DESC LIMIT 20`
4. Enable verbose logging by checking `Logger.js` output

## Architecture Notes

- The service is designed to run autonomously in Docker with automatic restarts
- Health checks are critical for Docker/Kubernetes orchestration
- Socket.io provides real-time sync progress to the React dashboard
- The two-tier sync system optimizes API usage by focusing deep syncs on active players
- Prisma abstracts database operations but raw queries are used for complex operations (see `PrismaService`)
- Token caching in `ExternalApiService` prevents unnecessary OAuth calls
