#!/bin/bash

# 🚀 WoW Guild Sync - Automated Deployment Script
# Run this after git pull to deploy everything automatically

set -e  # Exit on any error

echo "🚀 Starting WoW Guild Sync deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found!"
    print_warning "Please create a .env file with your configuration:"
    echo "GUILD_NAME=Your Guild Name"
    echo "GUILD_REALM=your-server-name"  
    echo "GUILD_REGION=us"
    echo "BLIZZARD_CLIENT_ID=your_client_id_here"
    echo "BLIZZARD_CLIENT_SECRET=your_client_secret_here"
    exit 1
fi

print_status "Environment file found ✓"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running!"
    print_warning "Please start Docker service first:"
    echo "sudo systemctl start docker"
    exit 1
fi

print_status "Docker is running ✓"

# Backup existing database if it exists
if [ -f "./data/guild-sync.db" ]; then
    BACKUP_NAME="guild-sync-backup-$(date +%Y%m%d-%H%M%S).db"
    print_status "Creating database backup: $BACKUP_NAME"
    cp "./data/guild-sync.db" "./data/$BACKUP_NAME"
    print_success "Database backed up"
    
    # Keep only last 5 backups
    print_status "Cleaning old backups (keeping last 5)"
    ls -t ./data/guild-sync-backup-*.db | tail -n +6 | xargs -r rm --
fi

# Build React app with Vite
print_status "Building React frontend with Vite..."
cd src/web
if [ ! -d node_modules ]; then
    print_status "Installing npm dependencies..."
    npm install
fi
npm run build
cd ../..
print_success "Frontend built"

# Stop existing containers gracefully
print_status "Stopping existing containers..."
docker compose down --remove-orphans
print_success "Containers stopped"

# Build and start new containers
print_status "Building and starting Docker containers..."
docker compose up --build -d
print_success "Containers started"

# Wait for services to be ready
print_status "Waiting for services to start..."
sleep 10

# Health check
print_status "Performing health check..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
        print_success "Health check passed"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        print_error "Health check failed after $MAX_RETRIES attempts"
        print_warning "Check container logs with: docker logs wow-guild-sync"
        exit 1
    fi
    
    echo -n "."
    sleep 2
done

# Show deployment info
echo ""
echo "════════════════════════════════════════════════════════════════"
print_success "🎉 Deployment completed successfully!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🌐 Web Dashboard:    http://localhost:3001"
echo "🔗 JSON API:         http://localhost:3001/api/members"  
echo "📖 API Docs:         http://localhost:3001/api/docs"
echo "💚 Health Check:     http://localhost:3001/health"
echo "📊 Metrics:          http://localhost:3001/metrics"
echo ""
echo "🐳 Docker Commands:"
echo "   View logs:        docker logs wow-guild-sync -f"
echo "   Container status: docker ps"
echo "   Stop service:     docker compose down"
echo "   Restart:          docker compose restart"
echo ""

# Show current status
print_status "Current service status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
print_success "Ready to sync your WoW guild! 🏰"