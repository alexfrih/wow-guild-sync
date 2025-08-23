# 🏰 WoW Guild Sync

Simple tool that syncs your WoW guild data automatically.

## 🚀 Quick Start

**Start:**
```bash
docker-compose up -d
```

**Stop:**
```bash
docker-compose down
```

**Restart:**
```bash
docker-compose restart
```

**View logs:**
```bash
docker-compose logs -f
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