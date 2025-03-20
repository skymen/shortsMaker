const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const Store = require("electron-store");
const url = require("url");
const { createVideoWithTextOverlay } = require("./addAnimatedText");

// Initialize data store
const store = new Store({
  name: "video-shorts-creator",
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false, // Allow loading local resources
    },
  });

  // Always try to connect to React dev server first
  // If not available (production build), load from local file
  const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "./build/index.html")}`;

  mainWindow.loadURL(startUrl);

  // Always open DevTools for easier debugging
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Register custom protocol to handle local videos
  protocol.registerFileProtocol("local-video", (request, callback) => {
    const filePath = decodeURI(request.url.replace("local-video://", ""));
    try {
      return callback(filePath);
    } catch (error) {
      console.error("Error with protocol handler:", error);
      return callback(404);
    }
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers

// Select folder with videos
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (!result.canceled) {
    const folderPath = result.filePaths[0];
    const files = fs
      .readdirSync(folderPath)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);
      })
      .map((file) => {
        return {
          path: path.join(folderPath, file),
          name: file,
          processed: false,
        };
      });

    return { folderPath, files };
  }

  return null;
});

// Get video metadata
ipcMain.handle("get-video-metadata", async (event, videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const { duration } = metadata.format;
      resolve({ duration });
    });
  });
});

// Save seams and metadata for a video
ipcMain.handle(
  "save-seams",
  async (event, { videoPath, seams, segmentNames, textOverlay }) => {
    const savedVideos = store.get("videos") || {};
    savedVideos[videoPath] = {
      seams,
      segmentNames,
      textOverlay,
    };
    store.set("videos", savedVideos);
    console.log("Saved seams for video:", videoPath);
    console.log("Seams:", seams);
    return true;
  }
);

// Get saved seams for a video
ipcMain.handle("get-seams", async (event, videoPath) => {
  const savedVideos = store.get("videos") || {};
  return savedVideos[videoPath] || null;
});

// Process videos based on seams and metadata
ipcMain.handle("process-videos", async (event, videos) => {
  // Configure the number of concurrent video processes
  const MAX_CONCURRENT_VIDEOS = 3; // Adjust based on your hardware capabilities
  const savedVideos = store.get("videos") || {};

  // Process videos with limited concurrency
  return processVideosInBatches(videos, savedVideos, MAX_CONCURRENT_VIDEOS);
});

// Function to process videos in batches with limited concurrency
async function processVideosInBatches(videos, savedVideos, concurrency) {
  const results = [];

  // Process videos in batches of 'concurrency' size
  for (let i = 0; i < videos.length; i += concurrency) {
    const batch = videos.slice(i, i + concurrency);

    // Process this batch in parallel
    const batchPromises = batch.map((video) =>
      processVideo(video, savedVideos)
    );
    const batchResults = await Promise.all(batchPromises);

    results.push(...batchResults);
  }

  return results;
}

// Function to process a single video
async function processVideo(video, savedVideos) {
  // Skip videos with no seams
  if (!savedVideos[video.path]) {
    return {
      path: video.path,
      success: false,
      message: "No seams found for this video",
    };
  }

  const videoData = savedVideos[video.path];
  const seams = videoData.seams;
  const segmentNames = videoData.segmentNames || [];
  const textOverlays = videoData.textOverlay || [];

  const outputDir = path.join(path.dirname(video.path), "shorts");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create a unique temp directory for this video process
  const uniqueId = Date.now() + "_" + Math.floor(Math.random() * 10000);
  const videoTempDir = path.join(outputDir, `temp_${uniqueId}`);

  if (!fs.existsSync(videoTempDir)) {
    fs.mkdirSync(videoTempDir, { recursive: true });
  }

  // Extract chapter and lesson from filename
  const filename = path.basename(video.path, path.extname(video.path));
  const match =
    filename.match(/Chapter\s*(\d+)\s*Lecon\s*(\d+)/i) ||
    filename.match(/Chapitre\s*(\d+)\s*Leçon\s*(\d+)/i);

  let chapterInfo = "";
  if (match) {
    chapterInfo = `Chapitre ${match[1]} Leçon ${match[2]}`;
  }

  // Process each segment
  const segments = [];
  const defaultPartNames = ["Cours", "Exercice", "Lecture", "Vocabulaire"];

  for (let i = 0; i < seams.length - 1; i++) {
    const startTime = seams[i].time;
    const endTime = seams[i + 1].time;

    // Use custom name if available, otherwise use default
    const partName = textOverlays[i] || defaultPartNames[i] || `Partie${i + 1}`;
    // Clean the name for filename (remove special characters)
    const safePartName = partName.replace(/[^a-zA-Z0-9 É]/g, "_");

    const outputPath = path.join(
      outputDir,
      `${chapterInfo} Partie ${i + 1} ${safePartName}${path.extname(
        video.path
      )}`
    );

    // Generate intermediate file path for processing with text overlay
    const intermediateOutputPath = textOverlays[i]
      ? path.join(videoTempDir, `temp_${i}_${path.basename(outputPath)}`)
      : outputPath;

    segments.push({
      start: startTime,
      end: endTime,
      output: intermediateOutputPath,
      finalOutput: outputPath,
      textOverlay: textOverlays[i] || "",
      partName: segmentNames[i] || partName,
    });
  }

  try {
    // Process each segment
    for (const segment of segments) {
      // Step 1: Cut the segment from the original video
      await new Promise((resolve, reject) => {
        ffmpeg(video.path)
          .setStartTime(segment.start)
          .setDuration(segment.end - segment.start)
          .output(segment.output)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      // Step 2: Add text overlay if specified
      if (segment.textOverlay) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(`Adding text overlay for segment: ${segment.partName}`);

        try {
          // Extract chapter and lesson info for the overlay text
          let chapterLessonText = "";
          if (match) {
            chapterLessonText = `Chapitre ${match[1]} - Leçon ${match[2]}`;
          }

          // Create the full overlay text with chapter info and part name
          const overlayText = `${chapterLessonText}\n${segment.partName}\n${segment.textOverlay}`;

          // Apply text overlay with animation
          await createVideoWithTextOverlay({
            inputVideoPath: segment.output,
            outputVideoPath: segment.finalOutput,
            text: overlayText,
            tempDir: videoTempDir, // Use the video-specific temp directory
            fontFamily: "Raleway",
            fontWeight: "bold",
            fontSize: 60,
            fontColor: "#FFFFFF",
            textAlign: "center",
            rectColor: "rgba(33, 150, 243, 0.8)",
            rectPadding: 30,
            rectRadius: 20,
            startTime: 0,
            fadeInDuration: 0.3,
            stayDuration: 2,
            fadeOutDuration: 0.3,
            keepTempFiles: false,
            slideDistance: 100,
          });

          // Remove the intermediate file if it's different from the final output
          if (
            segment.output !== segment.finalOutput &&
            fs.existsSync(segment.output)
          ) {
            fs.unlinkSync(segment.output);
          }
        } catch (overlayError) {
          console.error(`Error adding text overlay: ${overlayError.message}`);
          // If overlay fails, rename intermediate file to final output
          if (
            segment.output !== segment.finalOutput &&
            fs.existsSync(segment.output)
          ) {
            fs.renameSync(segment.output, segment.finalOutput);
          }
        }
      }
    }

    // Clean up this video's temp directory
    if (fs.existsSync(videoTempDir)) {
      try {
        fs.rmdirSync(videoTempDir, { recursive: true });
      } catch (error) {
        console.error(
          `Error cleaning up temp directory for video ${video.path}: ${error.message}`
        );
      }
    }

    return {
      path: video.path,
      success: true,
      message: `Successfully processed ${segments.length} segments`,
    };
  } catch (error) {
    // Clean up temp directory even on error
    if (fs.existsSync(videoTempDir)) {
      try {
        fs.rmdirSync(videoTempDir, { recursive: true });
      } catch (cleanupError) {
        console.error(
          `Error cleaning up temp directory: ${cleanupError.message}`
        );
      }
    }

    return {
      path: video.path,
      success: false,
      message: error.message,
    };
  }
}
