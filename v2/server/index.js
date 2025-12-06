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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

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
  `http://localhost:${PORT}/auth/callback`
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

// Process video segments
app.post("/api/process", async (req, res) => {
  const { videoId, videoUrl, seams, segmentNames, textOverlays } = req.body;

  if (!videoUrl || !seams || seams.length < 2) {
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
      const outputPath = path.join(
        jobOutputDir,
        `${videoId}_segment_${i + 1}.mp4`
      );

      await new Promise((resolve, reject) => {
        ffmpeg(videoUrl)
          .setStartTime(startTime)
          .setDuration(duration)
          .outputOptions([
            "-c:v libx264",
            "-c:a aac",
            "-preset fast",
            "-crf 23",
          ])
          .output(outputPath)
          .on("end", () => {
            results.push({
              index: i,
              name: segmentName,
              path: outputPath,
              relativePath: `/output/${jobId}/${path.basename(outputPath)}`,
              duration,
              startTime,
              endTime,
            });
            resolve();
          })
          .on("error", reject)
          .run();
      });
    }

    res.json({
      success: true,
      jobId,
      segments: results,
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({ error: "Failed to process video" });
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

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎬 Shorts Maker v2 Server Running                   ║
║                                                       ║
║   Local:  http://localhost:${PORT}                      ║
║                                                       ║
║   Make sure you have set up your .env file with:      ║
║   - YOUTUBE_CLIENT_ID                                 ║
║   - YOUTUBE_CLIENT_SECRET                             ║
║   - YOUTUBE_API_KEY                                   ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});
