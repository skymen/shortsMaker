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

