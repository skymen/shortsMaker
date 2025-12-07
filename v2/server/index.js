require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BASE_URL =
  process.env.BASE_URL ||
  (IS_PRODUCTION
    ? "https://shorts-maker.dedragames.com"
    : `http://localhost:${PORT}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Trust proxy for correct protocol detection behind nginx
if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

// Create temp and output directories
const tempDir = path.join(__dirname, "../temp");
const outputDir = path.join(__dirname, "../output");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage });

// YouTube OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  `${BASE_URL}/auth/callback`
);

const youtube = google.youtube({ version: "v3", auth: oauth2Client });

// Store tokens in memory (in production, use a database)
let userTokens = null;

// ============ AUTH ROUTES ============

// Generate auth URL
app.get("/api/auth/url", (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });

  res.json({ url: authUrl });
});

// OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    userTokens = tokens;

    // Redirect to main app with success
    res.redirect("/?auth=success");
  } catch (error) {
    console.error("Auth error:", error);
    res.redirect("/?auth=error");
  }
});

// Check auth status
app.get("/api/auth/status", (req, res) => {
  res.json({ authenticated: !!userTokens });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  userTokens = null;
  oauth2Client.revokeCredentials();
  res.json({ success: true });
});

// ============ YOUTUBE API ROUTES ============

// Search for channels
app.get("/api/youtube/search-channels", async (req, res) => {
  const { query } = req.query;

  try {
    const response = await google.youtube("v3").search.list({
      key: process.env.YOUTUBE_API_KEY,
      part: "snippet",
      q: query,
      type: "channel",
      maxResults: 10,
    });

    res.json(response.data.items);
  } catch (error) {
    console.error("Channel search error:", error);
    res.status(500).json({ error: "Failed to search channels" });
  }
});

// Get channel videos
app.get("/api/youtube/channel/:channelId/videos", async (req, res) => {
  const { channelId } = req.params;
  const { pageToken, maxResults = 20 } = req.query;

  try {
    // First get the uploads playlist ID
    const channelResponse = await google.youtube("v3").channels.list({
      key: process.env.YOUTUBE_API_KEY,
      part: "contentDetails,snippet",
      id: channelId,
    });

    if (
      !channelResponse.data.items ||
      channelResponse.data.items.length === 0
    ) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const channel = channelResponse.data.items[0];
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

    // Get videos from uploads playlist
    const videosResponse = await google.youtube("v3").playlistItems.list({
      key: process.env.YOUTUBE_API_KEY,
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: parseInt(maxResults),
      pageToken: pageToken || undefined,
    });

    // Get video details (duration, etc.)
    const videoIds = videosResponse.data.items.map(
      (item) => item.contentDetails.videoId
    );

    const videoDetailsResponse = await google.youtube("v3").videos.list({
      key: process.env.YOUTUBE_API_KEY,
      part: "contentDetails,statistics",
      id: videoIds.join(","),
    });

    // Merge video details
    const videos = videosResponse.data.items.map((item) => {
      const details = videoDetailsResponse.data.items.find(
        (v) => v.id === item.contentDetails.videoId
      );
      return {
        id: item.contentDetails.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail:
          item.snippet.thumbnails.high?.url ||
          item.snippet.thumbnails.default?.url,
        publishedAt: item.snippet.publishedAt,
        duration: details?.contentDetails?.duration || "PT0S",
        viewCount: details?.statistics?.viewCount || "0",
      };
    });

    res.json({
      channel: {
        id: channel.id,
        title: channel.snippet.title,
        thumbnail: channel.snippet.thumbnails.default?.url,
      },
      videos,
      nextPageToken: videosResponse.data.nextPageToken,
      prevPageToken: videosResponse.data.prevPageToken,
      totalResults: videosResponse.data.pageInfo.totalResults,
    });
  } catch (error) {
    console.error("Get videos error:", error);
    res.status(500).json({ error: "Failed to get channel videos" });
  }
});

// Get single video details
app.get("/api/youtube/video/:videoId", async (req, res) => {
  const { videoId } = req.params;

  try {
    const response = await google.youtube("v3").videos.list({
      key: process.env.YOUTUBE_API_KEY,
      part: "snippet,contentDetails,statistics",
      id: videoId,
    });

    if (!response.data.items || response.data.items.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = response.data.items[0];
    res.json({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.high?.url,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      channelTitle: video.snippet.channelTitle,
      channelId: video.snippet.channelId,
    });
  } catch (error) {
    console.error("Get video error:", error);
    res.status(500).json({ error: "Failed to get video details" });
  }
});

// ============ VIDEO PROCESSING ROUTES ============

// Create videos directory for downloaded full videos
const videosDir = path.join(__dirname, "../videos");
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

// Serve downloaded videos
app.use("/videos", express.static(videosDir));

// Track download progress
const downloadProgress = new Map();

// Helper to run shell commands
function execPromise(cmd, options = {}) {
  const { exec } = require("child_process");
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

// Download full YouTube video
app.post("/api/video/download", async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: "Video ID required" });
  }

  const outputFilename = `${videoId}.mp4`;
  const outputPath = path.join(videosDir, outputFilename);

  // Check if already downloaded
  if (fs.existsSync(outputPath)) {
    return res.json({
      success: true,
      videoUrl: `/videos/${outputFilename}`,
      cached: true,
    });
  }

  try {
    console.log(`Downloading video: ${videoId}`);
    downloadProgress.set(videoId, { status: "downloading", progress: 0 });

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Download with yt-dlp
    await execPromise(
      `yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" ` +
        `--merge-output-format mp4 -o "${outputPath}" "${youtubeUrl}"`,
      { timeout: 600000 } // 10 minute timeout
    );

    downloadProgress.set(videoId, { status: "complete", progress: 100 });

    res.json({
      success: true,
      videoUrl: `/videos/${outputFilename}`,
      cached: false,
    });
  } catch (error) {
    console.error("Download error:", error);
    downloadProgress.set(videoId, { status: "error", error: error.message });
    res.status(500).json({
      error: "Failed to download video",
      details: error.message,
    });
  }
});

// Check download status
app.get("/api/video/status/:videoId", (req, res) => {
  const { videoId } = req.params;
  const outputFilename = `${videoId}.mp4`;
  const outputPath = path.join(videosDir, outputFilename);

  if (fs.existsSync(outputPath)) {
    return res.json({ status: "ready", videoUrl: `/videos/${outputFilename}` });
  }

  const progress = downloadProgress.get(videoId);
  if (progress) {
    return res.json(progress);
  }

  res.json({ status: "not_started" });
});

// Helper function to download YouTube video segment
async function downloadYouTubeSegment(videoId, startTime, endTime, outputPath) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const duration = endTime - startTime;

  // First, get the direct video URL using yt-dlp
  try {
    const { stdout: videoUrl } = await execPromise(
      `yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" -g "${youtubeUrl}"`,
      { timeout: 30000 }
    );

    const urls = videoUrl.trim().split("\n");
    const videoStreamUrl = urls[0];
    const audioStreamUrl = urls[1] || urls[0];

    // Use ffmpeg to download and cut the segment
    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Add video stream with seek
      command = command
        .input(videoStreamUrl)
        .inputOptions([`-ss ${startTime}`]);

      // Add audio stream if separate
      if (urls.length > 1) {
        command = command
          .input(audioStreamUrl)
          .inputOptions([`-ss ${startTime}`]);
      }

      command
        .outputOptions([
          `-t ${duration}`,
          "-c:v libx264",
          "-c:a aac",
          "-preset fast",
          "-crf 23",
          "-movflags +faststart",
          "-y",
        ])
        .output(outputPath)
        .on("start", (cmd) => console.log("FFmpeg started:", cmd))
        .on("progress", (progress) =>
          console.log("Processing:", progress.percent?.toFixed(1) + "%")
        )
        .on("end", () => resolve(outputPath))
        .on("error", (err) => reject(err))
        .run();
    });
  } catch (error) {
    console.error("yt-dlp error:", error);
    throw new Error(
      "Failed to get video URL. Make sure yt-dlp is installed: brew install yt-dlp"
    );
  }
}

// Process single segment (for preview)
app.post("/api/process", async (req, res) => {
  const { videoId, startTime, endTime, segmentIndex } = req.body;

  if (!videoId || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: "Invalid request data" });
  }

  const outputFilename = `${videoId}_segment_${
    segmentIndex || 1
  }_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, outputFilename);

  try {
    console.log(
      `Processing segment: ${videoId} from ${startTime}s to ${endTime}s`
    );

    await downloadYouTubeSegment(videoId, startTime, endTime, outputPath);

    res.json({
      success: true,
      outputPath: outputPath,
      filename: outputFilename,
      duration: endTime - startTime,
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({
      error: "Failed to process video",
      details: error.message,
    });
  }
});

// Process all segments for a video
app.post("/api/process-all", async (req, res) => {
  const { videoId, seams, segmentNames } = req.body;

  if (!videoId || !seams || seams.length < 2) {
    return res.status(400).json({ error: "Invalid request data" });
  }

  const jobId = uuidv4();
  const jobOutputDir = path.join(outputDir, jobId);
  fs.mkdirSync(jobOutputDir, { recursive: true });

  try {
    const results = [];

    for (let i = 0; i < seams.length - 1; i++) {
      const startTime = seams[i].time;
      const endTime = seams[i + 1].time;
      const duration = endTime - startTime;
      const segmentName = segmentNames?.[i] || `Segment ${i + 1}`;
      const outputFilename = `${videoId}_segment_${i + 1}.mp4`;
      const outputPath = path.join(jobOutputDir, outputFilename);

      console.log(`Processing segment ${i + 1}: ${startTime}s to ${endTime}s`);

      await downloadYouTubeSegment(videoId, startTime, endTime, outputPath);

      results.push({
        index: i,
        name: segmentName,
        path: outputPath,
        relativePath: `/output/${jobId}/${outputFilename}`,
        duration,
        startTime,
        endTime,
      });
    }

    res.json({
      success: true,
      jobId,
      segments: results,
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({
      error: "Failed to process video",
      details: error.message,
    });
  }
});

// Serve output files
app.use("/output", express.static(outputDir));

// ============ YOUTUBE UPLOAD ROUTES ============

// Upload video to YouTube
app.post("/api/youtube/upload", upload.single("video"), async (req, res) => {
  if (!userTokens) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { title, description, tags, privacyStatus = "private" } = req.body;
  const videoPath = req.file?.path;

  if (!videoPath) {
    return res.status(400).json({ error: "No video file provided" });
  }

  try {
    oauth2Client.setCredentials(userTokens);

    const response = await youtube.videos.insert({
      part: "snippet,status",
      requestBody: {
        snippet: {
          title,
          description,
          tags: tags ? tags.split(",").map((t) => t.trim()) : [],
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    // Clean up temp file
    fs.unlinkSync(videoPath);

    res.json({
      success: true,
      videoId: response.data.id,
      url: `https://youtube.com/watch?v=${response.data.id}`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    // Clean up temp file on error
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    res.status(500).json({ error: "Failed to upload video" });
  }
});

// Upload from server path (for processed segments)
app.post("/api/youtube/upload-segment", async (req, res) => {
  if (!userTokens) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const {
    segmentPath,
    title,
    description,
    tags,
    privacyStatus = "private",
  } = req.body;
  const fullPath = path.join(__dirname, "..", segmentPath.replace(/^\//, ""));

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Segment file not found" });
  }

  try {
    oauth2Client.setCredentials(userTokens);

    const response = await youtube.videos.insert({
      part: "snippet,status",
      requestBody: {
        snippet: {
          title,
          description,
          tags: tags ? tags.split(",").map((t) => t.trim()) : [],
          categoryId: "22",
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(fullPath),
      },
    });

    res.json({
      success: true,
      videoId: response.data.id,
      url: `https://youtube.com/watch?v=${response.data.id}`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload video" });
  }
});

// ============ START SERVER ============

// Get local network IP
function getLocalIP() {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const HOST = "0.0.0.0"; // Listen on all network interfaces
const localIP = getLocalIP();

app.listen(PORT, HOST, () => {
  if (IS_PRODUCTION) {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎬 Shorts Maker v2 - PRODUCTION                     ║
║                                                       ║
║   URL:      ${BASE_URL.padEnd(36)}║
║   Port:     ${String(PORT).padEnd(36)}║
║   OAuth:    ${(BASE_URL + "/auth/callback").padEnd(36).substring(0, 36)}║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
  } else {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎬 Shorts Maker v2 - DEVELOPMENT                    ║
║                                                       ║
║   Local:    http://localhost:${PORT}                    ║
║   Network:  http://${localIP}:${PORT}                  ║
║                                                       ║
║   Make sure you have set up your .env file with:      ║
║   - YOUTUBE_CLIENT_ID                                 ║
║   - YOUTUBE_CLIENT_SECRET                             ║
║   - YOUTUBE_API_KEY                                   ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
  }
});
