# 🏰 WoW Guild Sync

Simple tool that syncs your WoW guild data automatically.

## 🚀 Quick Start

### For PRODUCTION (server/live deployment):
```bash
./deploy.sh
```
This handles everything: builds frontend, creates backups, health checks.

### For DEVELOPMENT (your local machine):
```bash
docker-compose up --watch
```
Auto-rebuilds when you change code.

### Basic Commands:
```bash
docker-compose up -d      # Start
docker-compose down       # Stop  
docker-compose restart    # Restart
docker-compose logs -f    # View logs
```

## 📊 Check It's Working

Open http://localhost:3001/health - you should see `"status":"healthy"`

## ⚙️ Setup

Create `.env` file:
```env
GUILD_NAME=Your Guild Name
GUILD_REALM=your-server-name  
GUILD_REGION=us
BLIZZARD_CLIENT_ID=your_client_id
BLIZZARD_CLIENT_SECRET=your_client_secret
```

Get API keys from: https://develop.battle.net/

## 🔄 Automatic Development Mode

**Start with auto-rebuild on code changes:**
```bash
docker-compose up --watch
```
This automatically rebuilds when you change files in `src/`

## 🔄 Manual Commands

**After changing CODE (src/ files):**
```bash
docker-compose up --build -d
```

**Just restart (no code changes):**
```bash
docker-compose restart
```

**After changing CONFIG (.env, docker-compose.yml):**
```bash
docker-compose down
docker-compose up -d
```

## 🔧 If Something's Wrong

**See what's happening:**
```bash
docker-compose logs
```

**Start over:**
```bash
docker-compose down
docker-compose up --build -d
```

That's it! Once running, it automatically syncs your guild every 6 hours.