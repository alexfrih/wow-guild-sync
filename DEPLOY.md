# WoW Guild Sync - Production Deployment

## Quick Deploy

```bash
./deploy.sh
```

Done. The script handles everything automatically.

## First Time Setup

1. **Clone and configure:**
   ```bash
   git clone https://github.com/alexfrih/wow-guild-sync.git
   cd wow-guild-sync
   cp .env.example .env
   ```

2. **Edit .env with your guild info:**
   ```env
   GUILD_NAME=Your Guild Name
   GUILD_REALM=your-server-name
   GUILD_REGION=us
   BLIZZARD_CLIENT_ID=your_client_id
   BLIZZARD_CLIENT_SECRET=your_client_secret
   ```

3. **Deploy:**
   ```bash
   ./deploy.sh
   ```

## Access

- **Dashboard**: http://localhost:3001
- **API**: http://localhost:3001/api/members
- **Health**: http://localhost:3001/health

## Updates

```bash
git pull && ./deploy.sh
```

## Commands

```bash
# Logs
docker logs wow-guild-sync -f

# Status
docker ps

# Restart
docker compose restart

# Stop
docker compose down
```

## Notes

- Database auto-backups to `./data/`
- Keeps last 5 backups
- Auto-creates data directory
- Health checks every 30s
- Watchtower handles updates