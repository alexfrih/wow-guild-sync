# WoW Guild Sync

Simple WoW guild sync app. Set your guild info and run.

## Setup

1. Get Blizzard API keys: https://develop.battle.net/
2. Copy `.env.example` to `.env`
3. Fill in your guild and API info
4. Run `npm start`

## Required Config

```bash
GUILD_NAME=Your Guild Name
GUILD_REALM=your-server-name
GUILD_REGION=us
BLIZZARD_CLIENT_ID=your_client_id
BLIZZARD_CLIENT_SECRET=your_client_secret
```

## Run

```bash
npm install
npm start
```

Or with Docker:
```bash
docker-compose up -d
```

Data stored in `./data/guild-sync.db`
Health check: http://localhost:3001/health