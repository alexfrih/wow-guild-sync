#!/bin/bash

# 🔄 Migration Script: Named Volumes → Bind Mounts
# Run this ONCE on your VPS before using the new deploy.sh

echo "🔄 Migrating from named volumes to bind mounts..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { printf "${BLUE}[INFO]${NC} $1\n"; }
print_success() { printf "${GREEN}[SUCCESS]${NC} $1\n"; }
print_error() { printf "${RED}[ERROR]${NC} $1\n"; }

# Check if named volume exists
if docker volume ls | grep -q "wow-guild-sync_guild_data"; then
    print_status "Found existing named volume, migrating data..."
    
    # Create local data directory
    mkdir -p ./data
    
    # Extract data from named volume to host directory
    print_status "Copying data from Docker volume to host directory..."
    docker run --rm \
        -v wow-guild-sync_guild_data:/source \
        -v "$(pwd)/data":/dest \
        alpine cp -av /source/. /dest/
    
    print_success "Data migrated to ./data/"
    
    # Stop current containers
    print_status "Stopping current containers..."
    docker compose down
    
    # Remove old named volume (optional - keep for safety)
    # docker volume rm wow-guild-sync_guild_data
    
    print_success "Migration completed!"
    print_status "You can now run: git pull && ./deploy.sh"
    
elif [ -d "./data" ]; then
    print_success "Bind mount setup already exists!"
    print_status "You can run: git pull && ./deploy.sh"
    
else
    print_error "No existing data found. Starting fresh:"
    print_status "Run: git pull && ./deploy.sh"
fi

# Show current data
if [ -f "./data/guild-sync.db" ]; then
    print_status "Database found:"
    ls -lh ./data/guild-sync.db
fi