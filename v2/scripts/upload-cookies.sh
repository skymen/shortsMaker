#!/bin/bash

# =====================================================
# Upload YouTube cookies to the server
# =====================================================

SERVER="root@155.138.229.144"
APP_DIR="/var/www/shorts-maker"
COOKIES_FILE="${1:-cookies.txt}"

if [ ! -f "$COOKIES_FILE" ]; then
    echo "❌ Error: Cookies file not found: $COOKIES_FILE"
    echo ""
    echo "Usage: $0 [path-to-cookies.txt]"
    echo ""
    echo "To export cookies from your browser:"
    echo "1. Install 'Get cookies.txt LOCALLY' browser extension"
    echo "2. Go to youtube.com (make sure you're logged in)"
    echo "3. Click the extension and export cookies"
    echo "4. Save as cookies.txt"
    echo "5. Run: $0 cookies.txt"
    exit 1
fi

echo "📤 Uploading cookies to server..."
scp "$COOKIES_FILE" "$SERVER:$APP_DIR/cookies.txt"

if [ $? -eq 0 ]; then
    echo "✅ Cookies uploaded successfully!"
    echo ""
    echo "🔄 Restarting the server..."
    ssh "$SERVER" "pm2 restart shorts-maker"
    echo ""
    echo "✅ Done! YouTube downloads should now work."
else
    echo "❌ Failed to upload cookies"
    exit 1
fi

