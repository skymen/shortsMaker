# Shorts Maker v2

A web-based YouTube Shorts creation tool. Fetch videos from YouTube channels, mark seams to create segments, and upload your shorts directly to YouTube.

## Features

- 🔍 **Channel Search** - Search and browse YouTube channels
- 📺 **Video Browser** - View all videos from a channel with pagination
- ✂️ **Seam Editor** - Mark cut points on videos with a visual timeline
- 💾 **Local Storage** - All seams data saved per YouTube video ID
- ✅ **Progress Tracking** - Track which videos you've finished editing
- 📤 **YouTube Upload** - Upload your created shorts directly to YouTube
- ⌨️ **Keyboard Shortcuts** - Quick editing with Space, Arrow keys, M, and Ctrl+S

## Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the **YouTube Data API v3**
4. Create credentials:
   - **API Key** - For fetching public channel/video data
   - **OAuth 2.0 Client ID** - For YouTube uploads (choose "Web application")
     - Add `http://localhost:3000/auth/callback` to Authorized redirect URIs

### 2. Configure Environment

Create a `.env` file in the v2 folder:

```env
# YouTube API Configuration
YOUTUBE_CLIENT_ID=your_oauth_client_id
YOUTUBE_CLIENT_SECRET=your_oauth_client_secret
YOUTUBE_API_KEY=your_api_key

# Server Configuration
PORT=3000
```

### 3. Install Dependencies

```bash
cd v2
npm install
```

### 4. Install FFmpeg (for video processing)

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

### 5. Run the Application

```bash
npm start
```

Open http://localhost:3000 in your browser.

## Usage

### Basic Workflow

1. **Search for a channel** - Enter a channel name in the search box
2. **Select a video** - Click on any video from the list
3. **Add seams** - Play the video and click "Add Seam" at cut points (or press M)
4. **Edit segments** - Rename segments and add text overlays in the table
5. **Save your work** - Click Save (or Ctrl+S) to save to localStorage
6. **Mark as finished** - Click "Mark Finished" when done with a video

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| ← | Seek back 5s |
| → | Seek forward 5s |
| M | Add seam at current time |
| Ctrl+S | Save seams |

### Data Storage

All data is stored in your browser's localStorage:
- **Seams** - Cut points for each video (stored by YouTube video ID)
- **Segment Names** - Custom names for each segment
- **Text Overlays** - Text to overlay on each segment
- **Finished Status** - Track which videos are completed
- **Selected Channel** - Remember your last selected channel

### YouTube Upload

1. Click "Sign In" to authenticate with YouTube
2. Fill in the title template, description, and tags
3. Select privacy status (Private, Unlisted, or Public)
4. Click "Upload" on each segment

## Project Structure

```
v2/
├── server/
│   └── index.js      # Express server with YouTube API integration
├── public/
│   ├── index.html    # Main HTML file
│   ├── css/
│   │   └── styles.css # Styling
│   └── js/
│       ├── app.js     # Main application logic
│       └── storage.js # LocalStorage manager
├── temp/             # Temporary files during processing
├── output/           # Processed video segments
├── package.json
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/url` | GET | Get YouTube OAuth URL |
| `/api/auth/status` | GET | Check authentication status |
| `/api/auth/logout` | POST | Log out |
| `/api/youtube/search-channels` | GET | Search YouTube channels |
| `/api/youtube/channel/:id/videos` | GET | Get channel videos |
| `/api/youtube/video/:id` | GET | Get video details |
| `/api/youtube/upload-segment` | POST | Upload video to YouTube |

## Notes

- The app uses the YouTube IFrame Player API for video playback
- Video processing (cutting segments) requires FFmpeg installed on the server
- YouTube API has daily quotas - be mindful of API usage
- OAuth tokens are stored in memory (restart server = re-authenticate)

## Troubleshooting

**"Failed to search channels"**
- Check your API key is correctly set in `.env`
- Ensure YouTube Data API is enabled in Google Cloud Console

**"Not authenticated"**
- Click Sign In and complete the OAuth flow
- Make sure redirect URI matches your server URL

**Video not playing**
- Some videos may have embedding disabled
- Check browser console for errors

