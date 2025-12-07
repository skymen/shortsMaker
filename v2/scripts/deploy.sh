#!/bin/bash

# =====================================================
# Shorts Maker v2 - Local Deploy Script
# Deploys to 155.138.229.144 (shorts-maker.dedragames.com)
# =====================================================

set -e

SERVER="root@155.138.229.144"
APP_DIR="/var/www/shorts-maker"
APP_NAME="shorts-maker"

echo "🎬 Deploying Shorts Maker v2 to production..."
echo ""

# Get script directory (where v2 folder is)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "📁 Source: $SCRIPT_DIR"
echo "🎯 Target: $SERVER:$APP_DIR"
echo ""

# Sync files to server (excluding dev files)
echo "📤 Syncing files to server..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'temp/' \
  --exclude 'output/' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  ./ "$SERVER:$APP_DIR/"

echo ""
echo "🔧 Running remote setup..."

# Run commands on server
ssh "$SERVER" << 'ENDSSH'
set -e
cd /var/www/shorts-maker

# Ensure yt-dlp is installed and updated (required for video downloads)
echo "📥 Updating yt-dlp to latest version..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version

# Configure yt-dlp to use iOS client (bypasses JS challenge)
echo "⚙️ Configuring yt-dlp..."
mkdir -p ~/.config/yt-dlp
cat > ~/.config/yt-dlp/config << 'YTDLPCONFIG'
# Use iOS client to bypass JavaScript n-parameter challenge
--extractor-args youtube:player_client=ios,web
# Reduce logging noise
--no-warnings
YTDLPCONFIG

# Test yt-dlp can access YouTube
echo "🧪 Testing yt-dlp..."
yt-dlp --cookies /var/www/shorts-maker/cookies.txt --extractor-args "youtube:player_client=ios" -F "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | head -20 || echo "Test complete (may show errors if no cookies)"

# Create videos directory for downloaded videos
mkdir -p videos
mkdir -p output
mkdir -p temp

echo "📦 Installing dependencies..."
npm install --production --silent

echo "🔄 Restarting PM2 process..."
if pm2 describe shorts-maker > /dev/null 2>&1; then
  pm2 restart shorts-maker
else
  pm2 start ecosystem.config.js --env production
  pm2 save
fi

echo "✅ PM2 Status:"
pm2 list | grep shorts-maker || true

ENDSSH

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║                                                       ║"
echo "║   ✅ Deployment Complete!                             ║"
echo "║                                                       ║"
echo "║   🌐 https://shorts-maker.dedragames.com              ║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"

