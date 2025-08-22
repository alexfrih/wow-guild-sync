# 🚀 WoW Guild Sync - Deployment Guide

## Quick Deployment (VPS)

After `git pull`, run this single command to deploy everything automatically:

```bash
./deploy.sh
```

That's it! The script will:
- ✅ Validate environment configuration
- ✅ Backup existing database
- ✅ Build React frontend with Vite
- ✅ Rebuild Docker containers
- ✅ Perform health checks
- ✅ Show service status and URLs

## First Time Setup

1. **Clone repository:**
   ```bash
   git clone https://github.com/alexfrih/wow-guild-sync.git
   cd wow-guild-sync
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Configure your guild:**
   ```env
   GUILD_NAME=Pool Party
   GUILD_REALM=Archimonde
   GUILD_REGION=eu
   BLIZZARD_CLIENT_ID=your_client_id_here
   BLIZZARD_CLIENT_SECRET=your_client_secret_here
   ```

4. **Deploy:**
   ```bash
   ./deploy.sh
   ```

## Service URLs

- **Dashboard**: http://your-server-ip:3001
- **API**: http://your-server-ip:3001/api/members
- **Docs**: http://your-server-ip:3001/api/docs

## Updates

Simply pull latest changes and redeploy:

```bash
git pull
./deploy.sh
```

## Manual Commands

```bash
# View logs
docker logs wow-guild-sync -f

# Check status  
docker ps

# Restart service
docker compose restart

# Stop service
docker compose down
```

## Database Backups

The deployment script automatically creates database backups before each deployment in `./data/` directory. It keeps the last 5 backups automatically.