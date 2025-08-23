# 🏰 WoW Guild Sync - TODO List

## 🚨 Priority Issues

### 1. Fix M+ Score Automatic Updates
**Status:** INVESTIGATING
**Issue:** M+ scores not updating automatically during sync
**Analysis so far:**
- ExternalApiService has M+ score logic in `getMemberFromRaiderIO()` (line 123-127)
- Raider.IO API call includes `mythic_plus_scores_by_season:current` field
- Data extraction looks correct: `mythicPlusScore = currentSeason.scores?.all || 0`
- Need to check if sync process is actually calling the right API methods

**Next steps:**
- Check GuildSyncService processPlayerSync method 
- Verify that M+ scores are being saved to database
- Add more logging to track M+ score updates
- Test with actual character that has M+ score

### 2. Remove Manual Buttons from Web UI
**Status:** PENDING
**Task:** Remove these buttons (should be automatic via cron):
- Refresh data
- Discover guild 
- Force sync all
- Reset all data

**Files to check:**
- Web UI components in `src/web/` directory
- HealthServer.js endpoints that handle these actions

### 3. Add Real-time Logging System
**Status:** PENDING
**Requirements:**
- Add Socket.IO for real-time communication
- Create logs page in web app
- Stream cron job progress to UI
- Show success/error messages in real-time
- Display current sync status

**Implementation plan:**
1. Add socket.io dependency to package.json
2. Integrate Socket.IO in HealthServer.js 
3. Emit events from GuildSyncService during sync operations
4. Create logs page in web UI
5. Connect web UI to socket for real-time updates

**Files to modify:**
- package.json (add socket.io)
- src/services/HealthServer.js (add socket server)
- src/services/GuildSyncService.js (emit events)
- Web UI components (add logs page)

## 🔧 Technical Notes

**Current sync frequency:**
- Guild discovery: every 6 hours
- Player sync: every minute

**Database:**
- Using Prisma ORM with SQLite
- Tables: guild_members, sync_logs, database_versions

**APIs in use:**
- Raider.IO (primary for M+ scores)
- Blizzard API (fallback, provides PvP ratings)

## 📝 Development Workflow

After making changes:
```bash
docker-compose up --build -d
```

Check logs:
```bash
docker-compose logs -f
```

Access points:
- Health: http://localhost:3001/health
- Web UI: http://localhost:3001/
- API: http://localhost:3001/api/members