require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const { execSync } = require("child_process");

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

// Serve static files with correct MIME types
app.use(
  express.static(path.join(__dirname, "../public"), {
    setHeaders: (res, filePath) => {
      // Set correct MIME type for WebAssembly files
      if (filePath.endsWith(".wasm")) {
        res.setHeader("Content-Type", "application/wasm");
      }
    },
  })
);

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

// ============ CACHE MANAGEMENT ============
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB max cache size

// Get all cached video files with their stats
function getCachedVideoFiles() {
  if (!fs.existsSync(videosDir)) return [];

  const files = fs
    .readdirSync(videosDir)
    .filter((f) => f.endsWith(".mp4"))
    .map((filename) => {
      const filepath = path.join(videosDir, filename);
      try {
        const stats = fs.statSync(filepath);
        return {
          filename,
          filepath,
          size: stats.size,
          mtime: stats.mtime.getTime(),
          age: Date.now() - stats.mtime.getTime(),
        };
      } catch (e) {
        return null;
      }
    })
    .filter((f) => f !== null);

  // Sort by modification time (oldest first)
  return files.sort((a, b) => a.mtime - b.mtime);
}

// Clean videos older than 24 hours
function cleanOldCacheFiles() {
  const files = getCachedVideoFiles();
  let removedCount = 0;
  let freedBytes = 0;

  for (const file of files) {
    if (file.age > CACHE_MAX_AGE_MS) {
      try {
        fs.unlinkSync(file.filepath);
        removedCount++;
        freedBytes += file.size;
        console.log(
          `🗑️  Removed old cache file: ${file.filename} (age: ${Math.round(
            file.age / 3600000
          )}h)`
        );
      } catch (e) {
        console.error(`Failed to remove ${file.filename}:`, e.message);
      }
    }
  }

  if (removedCount > 0) {
    console.log(
      `🧹 Cache cleanup: removed ${removedCount} old files, freed ${(
        freedBytes /
        1024 /
        1024
      ).toFixed(1)} MB`
    );
  }

  return { removedCount, freedBytes };
}

// Enforce max cache size by removing oldest files
function enforceMaxCacheSize() {
  const files = getCachedVideoFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  if (totalSize <= CACHE_MAX_SIZE_BYTES) {
    return { removedCount: 0, freedBytes: 0 };
  }

  let currentSize = totalSize;
  let removedCount = 0;
  let freedBytes = 0;

  // Remove oldest files until under limit
  for (const file of files) {
    if (currentSize <= CACHE_MAX_SIZE_BYTES) break;

    try {
      fs.unlinkSync(file.filepath);
      currentSize -= file.size;
      freedBytes += file.size;
      removedCount++;
      console.log(
        `🗑️  Removed to free space: ${file.filename} (${(
          file.size /
          1024 /
          1024
        ).toFixed(1)} MB)`
      );
    } catch (e) {
      console.error(`Failed to remove ${file.filename}:`, e.message);
    }
  }

  if (removedCount > 0) {
    console.log(
      `📦 Cache size limit: removed ${removedCount} files, freed ${(
        freedBytes /
        1024 /
        1024
      ).toFixed(1)} MB`
    );
  }

  return { removedCount, freedBytes };
}

// Main cache cleanup function - call before processing new videos
function cleanupVideoCache() {
  console.log("🔍 Checking video cache...");
  const oldCleanup = cleanOldCacheFiles();
  const sizeCleanup = enforceMaxCacheSize();

  const totalRemoved = oldCleanup.removedCount + sizeCleanup.removedCount;
  if (totalRemoved === 0) {
    const files = getCachedVideoFiles();
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    console.log(
      `✅ Cache OK: ${files.length} files, ${(totalSize / 1024 / 1024).toFixed(
        1
      )} MB`
    );
  }

  return {
    removedCount: totalRemoved,
    freedBytes: oldCleanup.freedBytes + sizeCleanup.freedBytes,
  };
}

// Cookies file path for yt-dlp (to bypass bot detection)
const cookiesPath = path.join(__dirname, "../cookies.txt");

// Check cookies dynamically (can change after upload)
function hasCookies() {
  return fs.existsSync(cookiesPath);
}

if (hasCookies()) {
  console.log("✅ YouTube cookies found at:", cookiesPath);
} else {
  console.log("⚠️  No cookies.txt found. YouTube may block downloads.");
  console.log("   To fix: Add cookies.txt to", path.join(__dirname, ".."));
}

// Find yt-dlp binary path (Homebrew on macOS, or system path)
const ytdlpPath = fs.existsSync("/opt/homebrew/bin/yt-dlp")
  ? "/opt/homebrew/bin/yt-dlp"
  : "yt-dlp";

// Build yt-dlp command with optional cookies
function ytdlpCmd(format, url, extraArgs = "") {
  const cookiesArg = hasCookies() ? `--cookies "${cookiesPath}"` : "";
  return `${ytdlpPath} ${cookiesArg} -f "${format}" ${extraArgs} "${url}"`;
}

// ============ TEXT OVERLAY FUNCTION (ported from v1) ============
/**
 * Creates a video with text overlay - exact port from v1/addAnimatedText.js
 * With fade in/out and slide effects
 */
async function createVideoWithTextOverlay(config) {
  // Set default values (same as v1)
  const defaults = {
    tempDir: tempDir,
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fontSize: 40,
    fontColor: "white",
    textAlign: "center",
    rectColor: "rgba(0, 0, 0, 0.6)",
    rectPadding: 20,
    rectRadius: 10,
    startTime: 0,
    duration: 5,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    slideDistance: 50,
  };

  // Merge defaults with provided config
  config = { ...defaults, ...config };

  // Calculate the total duration if stayDuration is used
  if (config.stayDuration) {
    config.duration =
      config.fadeInDuration + config.stayDuration + config.fadeOutDuration;
  }

  // Validate required parameters
  if (!config.inputVideoPath || !config.outputVideoPath || !config.text) {
    throw new Error("inputVideoPath, outputVideoPath, and text are required");
  }

  // Make sure fade durations don't exceed total duration
  if (config.fadeInDuration + config.fadeOutDuration > config.duration) {
    const totalFadeDuration = config.duration * 0.8;
    const ratio =
      config.fadeInDuration / (config.fadeInDuration + config.fadeOutDuration);
    config.fadeInDuration = totalFadeDuration * ratio;
    config.fadeOutDuration = totalFadeDuration * (1 - ratio);
  }

  // Create temp directory if needed
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  // Get video dimensions using ffprobe
  console.log("Getting video dimensions...");
  const videoInfoCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${config.inputVideoPath}"`;
  const dimensions = execSync(videoInfoCmd).toString().trim().split("x");
  const videoWidth = parseInt(dimensions[0]);
  const videoHeight = parseInt(dimensions[1]);

  // Create SVG with text and rounded rectangle
  const textLines = config.text.split("\n");

  // Estimate text dimensions
  const charWidth = config.fontSize * 0.6;
  const lineHeight = config.fontSize * 1.2;
  const textWidth = Math.max(
    ...textLines.map((line) => line.length * charWidth)
  );
  const textHeight = lineHeight * textLines.length;

  // Calculate text position if not specified
  if (!config.textX) {
    config.textX = videoWidth / 2;
  }
  if (!config.textY) {
    config.textY = videoHeight / 2;
  }

  // Calculate rectangle dimensions
  const rectWidth = textWidth + config.rectPadding * 2;
  const rectHeight = textHeight + config.rectPadding * 2;

  // Calculate rectangle position based on text alignment
  let rectX;
  switch (config.textAlign) {
    case "left":
      rectX = config.textX;
      break;
    case "right":
      rectX = config.textX - rectWidth;
      break;
    default: // center
      rectX = config.textX - rectWidth / 2;
      break;
  }
  const rectY = config.textY - rectHeight / 2;

  // Create SVG with text and rounded rectangle (exact v1 format)
  const textSvg = `<svg width="${videoWidth}" height="${videoHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="${rectX}"
      y="${rectY}"
      width="${rectWidth}"
      height="${rectHeight}"
      rx="${config.rectRadius}"
      ry="${config.rectRadius}"
      fill="${config.rectColor}"
    />
    ${textLines
      .map((line, i) => {
        const yPos =
          rectY + config.rectPadding + i * lineHeight + config.fontSize * 0.8;
        let xPos;
        switch (config.textAlign) {
          case "left":
            xPos = rectX + config.rectPadding;
            break;
          case "right":
            xPos = rectX + rectWidth - config.rectPadding;
            break;
          default: // center
            xPos = rectX + rectWidth / 2;
            break;
        }
        return `<text
        x="${xPos}"
        y="${yPos}"
        font-family="${config.fontFamily}"
        font-size="${config.fontSize}px"
        font-weight="${config.fontWeight}"
        fill="${config.fontColor}"
        text-anchor="${
          config.textAlign === "left"
            ? "start"
            : config.textAlign === "right"
            ? "end"
            : "middle"
        }"
      >${escapeXml(line)}</text>`;
      })
      .join("\n")}
  </svg>`;

  // Save SVG to temp file
  const svgPath = path.join(config.tempDir, `text_overlay_${Date.now()}.svg`);
  fs.writeFileSync(svgPath, textSvg);

  // Convert SVG to PNG with transparency using sharp
  const overlayImagePath = path.join(
    config.tempDir,
    `text_overlay_${Date.now()}.png`
  );
  console.log(`Creating overlay image...`);
  await sharp(Buffer.from(textSvg)).png().toFile(overlayImagePath);

  console.log("Applying overlay to video with fade effects...");

  // Helper function to get video duration
  function getVideoDuration(videoPath) {
    try {
      const durationCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
      return parseFloat(execSync(durationCmd).toString().trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  try {
    const fadeInStartTime = config.startTime;
    const fadeInAnimDuration = config.fadeInDuration;
    const fadeOutStartTime =
      config.startTime + config.duration - config.fadeOutDuration;
    const fadeOutAnimDuration = config.fadeOutDuration;
    const slideDistance = config.slideDistance;

    // Build overlay filter (exact v1 format)
    const filterComplex = `
      [1:v]format=rgba,
      fade=t=in:st=0:d=${fadeInAnimDuration}:alpha=1,
      fade=t=out:st=${
        config.duration - fadeOutAnimDuration
      }:d=${fadeOutAnimDuration}:alpha=1
      [faded];
      [0:v][faded]overlay=
        0:
        'if(between(t,${fadeInStartTime},${
      fadeInStartTime + fadeInAnimDuration
    }),
          ${-slideDistance}+(t-${fadeInStartTime})/${fadeInAnimDuration}*${slideDistance},
          if(between(t,${fadeOutStartTime},${
      fadeOutStartTime + fadeOutAnimDuration
    }),
            (t-${fadeOutStartTime})/${fadeOutAnimDuration}*${slideDistance},
            0)
        )':
        enable='between(t,${fadeInStartTime},${
      fadeOutStartTime + fadeOutAnimDuration
    })'
    `.replace(/\n\s+/g, "");

    // FFmpeg command (exact v1 format)
    const ffmpegCmd = `ffmpeg -y -i "${
      config.inputVideoPath
    }" -loop 1 -i "${overlayImagePath}" -filter_complex "${filterComplex}" -map 0:a? -c:a copy -shortest -t ${Math.max(
      config.startTime + config.duration,
      getVideoDuration(config.inputVideoPath)
    )} "${config.outputVideoPath}"`;

    execSync(ffmpegCmd, { stdio: "pipe", maxBuffer: 50 * 1024 * 1024 });
    console.log(`Video with text overlay saved to ${config.outputVideoPath}`);

    // Clean up temporary files
    if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    if (fs.existsSync(overlayImagePath)) fs.unlinkSync(overlayImagePath);
  } catch (error) {
    console.error("Error processing video:", error);
    throw error;
  }
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  // Clean up old/excess cache before downloading new video
  cleanupVideoCache();

  try {
    console.log(`Downloading video: ${videoId}`);
    downloadProgress.set(videoId, { status: "downloading", progress: 0 });

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Download with yt-dlp (with cookies if available) - best quality
    const format =
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best";
    const cmd = ytdlpCmd(
      format,
      youtubeUrl,
      `--merge-output-format mp4 -o "${outputPath}"`
    );
    await execPromise(cmd, { timeout: 600000 }); // 10 minute timeout

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

// Proxy endpoint to bypass CORS for client-side requests
app.get("/api/proxy", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL required" });
  }

  try {
    const https = require("https");
    const http = require("http");
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    const proxyReq = protocol.get(url, { timeout: 30000 }, (proxyRes) => {
      // Forward headers
      res.set(
        "Content-Type",
        proxyRes.headers["content-type"] || "application/octet-stream"
      );
      res.set("Content-Length", proxyRes.headers["content-length"]);
      res.set("Access-Control-Allow-Origin", "*");

      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err);
      res.status(500).json({ error: "Proxy request failed" });
    });
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============ COOKIES MANAGEMENT ============

// Check cookies status
app.get("/api/cookies/status", (req, res) => {
  const exists = hasCookies();
  let info = null;

  if (exists) {
    const stats = fs.statSync(cookiesPath);
    info = {
      size: stats.size,
      modified: stats.mtime,
    };
  }

  res.json({ exists, info });
});

// Upload cookies.txt
app.post(
  "/api/cookies/upload",
  express.text({ type: "*/*", limit: "1mb" }),
  (req, res) => {
    try {
      const content = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "No content provided" });
      }

      // Basic validation - should contain Netscape cookie format
      if (
        !content.includes("youtube.com") &&
        !content.includes(".youtube.com")
      ) {
        return res.status(400).json({
          error: "Invalid cookies file. Must contain YouTube cookies.",
        });
      }

      // Write cookies file
      fs.writeFileSync(cookiesPath, content, "utf8");
      console.log("✅ Cookies uploaded successfully");

      const stats = fs.statSync(cookiesPath);
      res.json({
        success: true,
        message: "Cookies uploaded successfully",
        info: {
          size: stats.size,
          modified: stats.mtime,
        },
      });
    } catch (error) {
      console.error("Cookies upload error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete cookies
app.delete("/api/cookies", (req, res) => {
  try {
    if (hasCookies()) {
      fs.unlinkSync(cookiesPath);
      console.log("🗑️ Cookies deleted");
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy video download - downloads video via URL and streams to client
app.post("/api/video/proxy-download", async (req, res) => {
  const { videoUrl, videoId } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: "Video URL required" });
  }

  try {
    const https = require("https");
    const http = require("http");
    const parsedUrl = new URL(videoUrl);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    console.log(`Proxying video download: ${videoId || "unknown"}`);

    const proxyReq = protocol.get(videoUrl, { timeout: 600000 }, (proxyRes) => {
      res.set("Content-Type", "video/mp4");
      if (proxyRes.headers["content-length"]) {
        res.set("Content-Length", proxyRes.headers["content-length"]);
      }
      res.set("Access-Control-Allow-Origin", "*");

      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("Video proxy error:", err);
      res.status(500).json({ error: "Video proxy failed" });
    });
  } catch (error) {
    console.error("Video proxy error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get direct video URL for client-side download (fallback when server download is blocked)
app.post("/api/video/get-url", async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: "Video ID required" });
  }

  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Use yt-dlp to get the direct video URL without downloading
    // Try to get a format that works well in browsers
    const formats = [
      "best[ext=mp4]/best", // Prefer mp4 for browser compatibility
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
      "best",
    ];

    let videoUrl = null;
    let lastError = null;

    for (const format of formats) {
      try {
        const cookiesArg = hasCookies() ? `--cookies "${cookiesPath}"` : "";
        const cmd = `${ytdlpPath} ${cookiesArg} -f "${format}" --get-url "${youtubeUrl}"`;
        const { stdout } = await execPromise(cmd, { timeout: 30000 });

        // yt-dlp might return multiple URLs (video + audio), take the first one
        const urls = stdout
          .trim()
          .split("\n")
          .filter((u) => u.startsWith("http"));
        if (urls.length > 0) {
          videoUrl = urls[0];
          break;
        }
      } catch (e) {
        lastError = e;
        console.log(
          `Format ${format} failed for URL extraction:`,
          e.message?.substring(0, 100)
        );
      }
    }

    if (!videoUrl) {
      throw lastError || new Error("Could not extract video URL");
    }

    res.json({
      success: true,
      videoUrl,
      videoId,
      note: "URL expires quickly, download immediately",
    });
  } catch (error) {
    console.error("URL extraction error:", error);
    res.status(500).json({
      error: "Failed to extract video URL",
      details: error.message,
      blocked:
        error.message?.includes("HTTP Error 403") ||
        error.message?.includes("Sign in to confirm"),
    });
  }
});

// Receive video uploaded from client (for client-side download fallback)
app.post(
  "/api/video/upload-client",
  upload.single("video"),
  async (req, res) => {
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: "Video ID required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No video file provided" });
    }

    // Clean up old/excess cache before saving new video
    cleanupVideoCache();

    try {
      const outputFilename = `${videoId}.mp4`;
      const outputPath = path.join(videosDir, outputFilename);

      // Move the uploaded file to the videos directory
      fs.renameSync(req.file.path, outputPath);

      console.log(`Client-uploaded video saved: ${outputFilename}`);

      res.json({
        success: true,
        videoUrl: `/videos/${outputFilename}`,
        cached: false,
        source: "client-upload",
      });
    } catch (error) {
      console.error("Client upload error:", error);
      // Clean up the temp file if it exists
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        error: "Failed to save uploaded video",
        details: error.message,
      });
    }
  }
);

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

// Get cache status
app.get("/api/cache/status", (req, res) => {
  const files = getCachedVideoFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  res.json({
    fileCount: files.length,
    totalSizeMB: Math.round(totalSize / 1024 / 1024),
    maxSizeMB: Math.round(CACHE_MAX_SIZE_BYTES / 1024 / 1024),
    maxAgeHours: Math.round(CACHE_MAX_AGE_MS / 3600000),
    files: files.map((f) => ({
      filename: f.filename,
      sizeMB: Math.round(f.size / 1024 / 1024),
      ageHours: Math.round(f.age / 3600000),
    })),
  });
});

// Manually trigger cache cleanup
app.post("/api/cache/cleanup", (req, res) => {
  const result = cleanupVideoCache();
  const files = getCachedVideoFiles();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  res.json({
    success: true,
    removedCount: result.removedCount,
    freedMB: Math.round(result.freedBytes / 1024 / 1024),
    remainingFiles: files.length,
    remainingSizeMB: Math.round(totalSize / 1024 / 1024),
  });
});

// Helper function to download YouTube video segment
// Strategy: Download full video first with yt-dlp, then cut with ffmpeg
async function downloadYouTubeSegment(videoId, startTime, endTime, outputPath) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const duration = endTime - startTime;

  // Check if we already have the full video cached
  const cachedVideoPath = path.join(videosDir, `${videoId}.mp4`);

  try {
    // Step 1: Download full video if not cached
    if (!fs.existsSync(cachedVideoPath)) {
      // Clean up old/excess cache before downloading new video
      cleanupVideoCache();

      console.log(`Downloading full video: ${videoId}`);

      // Try multiple format options - prefer highest quality
      const formats = [
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best", // Best quality with merge
        "best[height>=1080]", // At least 1080p
        "best", // Fallback to any format
      ];

      let downloaded = false;

      // Try yt-dlp first
      for (const format of formats) {
        try {
          console.log(`Trying yt-dlp with format: ${format}`);
          const downloadCmd = ytdlpCmd(
            format,
            youtubeUrl,
            `--merge-output-format mp4 -o "${cachedVideoPath}"`
          );
          await execPromise(downloadCmd, { timeout: 600000 }); // 10 min timeout
          downloaded = true;
          console.log("Downloaded successfully with yt-dlp, format:", format);
          break;
        } catch (e) {
          console.log(
            `yt-dlp format ${format} failed:`,
            e.message?.substring(0, 100)
          );
        }
      }

      if (!downloaded) {
        throw new Error(
          "yt-dlp download failed. Try: 1) Update yt-dlp (brew upgrade yt-dlp), " +
            "2) Export fresh cookies from YouTube, " +
            "3) Test manually: yt-dlp -f best 'https://youtube.com/watch?v=" +
            videoId +
            "'"
        );
      }
    } else {
      console.log("Using cached video:", cachedVideoPath);
    }

    // Step 2: Cut the segment using ffmpeg
    console.log(`Cutting segment: ${startTime}s to ${endTime}s (${duration}s)`);

    return new Promise((resolve, reject) => {
      ffmpeg(cachedVideoPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions([
          "-c:v libx264",
          "-c:a aac",
          "-preset fast",
          "-crf 23",
          "-movflags +faststart",
          "-y",
        ])
        .output(outputPath)
        .on("start", (cmd) =>
          console.log("FFmpeg cutting:", cmd.substring(0, 200))
        )
        .on("progress", (progress) => {
          if (progress.percent)
            console.log("Cutting:", progress.percent.toFixed(1) + "%");
        })
        .on("end", () => {
          console.log("Segment created:", outputPath);
          resolve(outputPath);
        })
        .on("error", (err) => reject(err))
        .run();
    });
  } catch (error) {
    console.error("Download/processing error:", error);
    const cookieHint = hasCookies()
      ? "YouTube may have blocked this request. Try refreshing your cookies.txt"
      : "Add cookies.txt to bypass YouTube bot detection.";
    throw new Error(`Failed to process video. ${cookieHint}`);
  }
}

// Generate cache key for segments (includes text overlay hash for uniqueness)
function getSegmentCacheKey(videoId, startTime, endTime, textOverlay = "") {
  const start = Math.round(startTime * 100) / 100;
  const end = Math.round(endTime * 100) / 100;
  // Use MD5 hash for text overlay to ensure uniqueness
  const textHash = textOverlay
    ? "_t" +
      require("crypto")
        .createHash("md5")
        .update(textOverlay)
        .digest("hex")
        .slice(0, 12)
    : "";
  return `${videoId}_${start}_${end}${textHash}`;
}

// Create segments cache directory
const segmentsCacheDir = path.join(outputDir, "cache");
if (!fs.existsSync(segmentsCacheDir)) {
  fs.mkdirSync(segmentsCacheDir, { recursive: true });
}

// Clear cache for a specific video (used when title changes)
app.post("/api/cache/clear", (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: "videoId required" });
  }

  try {
    // Find and delete all cached segments for this video
    const files = fs.readdirSync(segmentsCacheDir);
    let deletedCount = 0;

    for (const file of files) {
      if (file.startsWith(videoId + "_")) {
        fs.unlinkSync(path.join(segmentsCacheDir, file));
        deletedCount++;
      }
    }

    console.log(`Cleared ${deletedCount} cached segments for video ${videoId}`);
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({ error: "Failed to clear cache" });
  }
});

// Process single segment (for preview) - with server-side caching and optional text overlay
app.post("/api/process", async (req, res) => {
  const { videoId, startTime, endTime, segmentIndex, textOverlay } = req.body;

  if (!videoId || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: "Invalid request data" });
  }

  // Generate cache key (includes text overlay for uniqueness)
  const cacheKey = getSegmentCacheKey(
    videoId,
    startTime,
    endTime,
    textOverlay || ""
  );
  const cachedFilename = `${cacheKey}.mp4`;
  const cachedPath = path.join(segmentsCacheDir, cachedFilename);

  // Check cache first
  if (fs.existsSync(cachedPath)) {
    console.log(`Cache hit: ${cacheKey}`);
    return res.json({
      success: true,
      outputPath: cachedPath,
      filename: `cache/${cachedFilename}`,
      duration: endTime - startTime,
      cached: true,
    });
  }

  try {
    console.log(
      `Processing segment: ${videoId} from ${startTime}s to ${endTime}s` +
        (textOverlay ? ` with overlay: "${textOverlay}"` : "")
    );

    // First, cut the segment
    const tempSegmentPath = path.join(tempDir, `segment_${Date.now()}.mp4`);
    await downloadYouTubeSegment(videoId, startTime, endTime, tempSegmentPath);

    // Apply text overlay if provided
    if (textOverlay && textOverlay.trim()) {
      console.log("Applying text overlay...");
      await createVideoWithTextOverlay({
        inputVideoPath: tempSegmentPath,
        outputVideoPath: cachedPath,
        text: textOverlay.replace(/\\n/g, "\n"), // Support \n in input
        tempDir: tempDir,
        fontFamily: "Raleway",
        fontWeight: "bold",
        fontSize: 60,
        fontColor: "#FFFFFF",
        textAlign: "center",
        rectColor: "rgba(33, 150, 243, 0.8)", // Blue background like v1
        rectPadding: 30,
        rectRadius: 20,
        startTime: 0,
        fadeInDuration: 0.3,
        stayDuration: 2,
        fadeOutDuration: 0.3,
        slideDistance: 100,
      });
      // Clean up temp file
      if (fs.existsSync(tempSegmentPath)) fs.unlinkSync(tempSegmentPath);
    } else {
      // No overlay, just move the file
      fs.renameSync(tempSegmentPath, cachedPath);
    }

    console.log(`Cached segment: ${cacheKey}`);

    res.json({
      success: true,
      outputPath: cachedPath,
      filename: `cache/${cachedFilename}`,
      duration: endTime - startTime,
      cached: false,
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
