#!/bin/bash

# =====================================================
# Shorts Maker v2 - Initial Server Setup Script
# Run this ONCE to set up a fresh server
# =====================================================

set -e

SERVER="root@155.138.229.144"
APP_DIR="/var/www/shorts-maker"

echo "🔧 Setting up server for Shorts Maker v2..."
echo ""

ssh "$SERVER" << 'ENDSSH'
set -e

# Create app directory
echo "📁 Creating application directory..."
mkdir -p /var/www/shorts-maker
mkdir -p /var/log/pm2

# Check Node.js
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node --version

# Check PM2
echo "🔄 Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi
pm2 --version

# Check FFmpeg
echo "🎬 Checking FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "Installing FFmpeg..."
    apt-get update
    apt-get install -y ffmpeg
fi
ffmpeg -version | head -1

# Check Certbot
echo "🔐 Checking Certbot..."
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi

echo ""
echo "✅ Server prerequisites installed!"

ENDSSH

# Copy files
echo ""
echo "📤 Copying files to server..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'temp/' \
  --exclude 'output/' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  ./ "$SERVER:$APP_DIR/"

# Setup on server
ssh "$SERVER" << 'ENDSSH'
set -e
cd /var/www/shorts-maker

echo "📦 Installing dependencies..."
npm install --production

# Create .env template if it doesn't exist
if [ ! -f ".env" ]; then
    echo "⚙️ Creating .env template..."
    cat > .env << 'EOF'
# YouTube API Configuration
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
YOUTUBE_API_KEY=your_api_key_here

# Server Configuration
PORT=3033
NODE_ENV=production
BASE_URL=https://shorts-maker.dedragames.com
EOF
    echo "⚠️  Edit .env with: nano /var/www/shorts-maker/.env"
fi

# Setup Nginx
echo "🌐 Setting up Nginx..."
cp nginx/shorts-maker.conf /etc/nginx/sites-available/shorts-maker
ln -sf /etc/nginx/sites-available/shorts-maker /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Setup PM2
echo "🔄 Setting up PM2..."
pm2 delete shorts-maker 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup | tail -1 | bash || true

ENDSSH

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║                                                       ║"
echo "║   ✅ Server Setup Complete!                           ║"
echo "║                                                       ║"
echo "║   📋 Next Steps:                                      ║"
echo "║                                                       ║"
echo "║   1. Edit .env file:                                  ║"
echo "║      ssh $SERVER                            ║"
echo "║      nano /var/www/shorts-maker/.env                  ║"
echo "║                                                       ║"
echo "║   2. Set up SSL:                                      ║"
echo "║      ssh $SERVER                            ║"
echo "║      certbot --nginx -d shorts-maker.dedragames.com   ║"
echo "║                                                       ║"
echo "║   3. Update Google Cloud Console OAuth redirect:      ║"
echo "║      https://shorts-maker.dedragames.com/auth/callback║"
echo "║                                                       ║"
echo "╚═══════════════════════════════════════════════════════╝"

