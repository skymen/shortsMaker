#!/bin/bash

# =====================================================
# Shorts Maker v2 - Deployment Script
# Run this on your server: bash deploy.sh
# =====================================================

set -e

# Configuration
APP_NAME="shorts-maker"
APP_DIR="/var/www/shorts-maker"
REPO_URL="https://github.com/YOUR_USERNAME/shorts-maker.git"  # Update this!
DOMAIN="shorts-maker.dedragames.com"

echo "🎬 Deploying Shorts Maker v2..."

# Create app directory
echo "📁 Creating application directory..."
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# If you're copying files manually instead of using git:
# scp -r v2/* user@155.138.229.144:/var/www/shorts-maker/

# Install dependencies
echo "📦 Installing dependencies..."
cd $APP_DIR
npm install --production

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file (you need to fill in the values)..."
    cat > .env << EOF
# YouTube API Configuration
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
YOUTUBE_API_KEY=your_api_key_here

# Server Configuration
PORT=3033
NODE_ENV=production
EOF
    echo "⚠️  Please edit .env file with your YouTube API credentials!"
fi

# Create log directory
echo "📝 Creating log directory..."
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

# Set up PM2
echo "🔄 Setting up PM2..."
pm2 delete $APP_NAME 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Set up Nginx
echo "🌐 Setting up Nginx..."
sudo cp nginx/shorts-maker.conf /etc/nginx/sites-available/$APP_NAME
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit /var/www/shorts-maker/.env with your YouTube API credentials"
echo "2. Set up SSL with: sudo certbot --nginx -d $DOMAIN"
echo "3. Update your DNS to point $DOMAIN to 155.138.229.144"
echo "4. Update OAuth redirect URI in Google Cloud Console to https://$DOMAIN/auth/callback"
echo ""
echo "🔧 Useful commands:"
echo "  pm2 status                    - Check app status"
echo "  pm2 logs $APP_NAME            - View logs"
echo "  pm2 restart $APP_NAME         - Restart app"
echo "  sudo nginx -t                 - Test nginx config"
echo "  sudo systemctl reload nginx   - Reload nginx"

