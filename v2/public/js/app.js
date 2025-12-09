/**
 * Shorts Maker v2 - Main Application
 * Uses YouTube IFrame API for editing, yt-dlp for export
 */

// ============ State ============
const state = {
  authenticated: false,
  selectedChannel: null,
  videos: [],
  selectedVideo: null,
  seams: [],
  segmentNames: [],
  textOverlays: [],
  videoTitleOverride: "", // Custom title for overlays (defaults to YT title)
  currentFilter: "all",
  videoSearchQuery: "",
  pagination: {
    nextToken: null,
    prevToken: null,
    currentPage: 1,
  },
  player: null, // YouTube player instance
  playerReady: false,
  playerIntervalId: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  isDraggingSeam: false,
  draggedSeamIndex: null,
  previewSegmentIndex: null,
  // Upload settings
  uploadSettings: {
    titleTemplate: "{title} - {part} {text}",
    description: "",
    tags: "",
    privacy: "private",
  },
  // Queue
  queue: [],
  queueProcessing: false,
  // Client-processed segments
  lastProcessedBlob: null,
  lastProcessedFilename: null,
  // Environment
  isProduction: false, // Set on init - true if running on Vultr
  // Server queue
  serverQueue: [],
  serverQueueLoaded: false,
};

// ============ API Functions ============
const API = {
  baseUrl: "",

  async checkAuth() {
    const res = await fetch(`${this.baseUrl}/api/auth/status`);
    if (!res.ok) throw new Error("Failed to check auth status");
    return (await res.json()).authenticated;
  },

  async getAuthUrl() {
    const res = await fetch(`${this.baseUrl}/api/auth/url`);
    if (!res.ok) throw new Error("Failed to get auth URL");
    return (await res.json()).url;
  },

  async logout() {
    const res = await fetch(`${this.baseUrl}/api/auth/logout`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to logout");
  },

  async searchChannels(query) {
    const res = await fetch(
      `${this.baseUrl}/api/youtube/search-channels?query=${encodeURIComponent(
        query
      )}`
    );
    if (!res.ok) throw new Error("Failed to search channels");
    return res.json();
  },

  async getChannelVideos(channelId, pageToken = null) {
    let url = `${this.baseUrl}/api/youtube/channel/${channelId}/videos?maxResults=20`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to get videos");
    return res.json();
  },

  async getVideo(videoId) {
    const res = await fetch(`${this.baseUrl}/api/youtube/video/${videoId}`);
    if (!res.ok) throw new Error("Failed to get video");
    return res.json();
  },

  async clearCache(videoId) {
    const res = await fetch(`${this.baseUrl}/api/cache/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    if (!res.ok) throw new Error("Failed to clear cache");
    return res.json();
  },

  // Cookies management
  async getCookiesStatus() {
    const res = await fetch(`${this.baseUrl}/api/cookies/status`);
    if (!res.ok) throw new Error("Failed to check cookies status");
    return res.json();
  },

  async uploadCookies(content) {
    const res = await fetch(`${this.baseUrl}/api/cookies/upload`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: content,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to upload cookies");
    }
    return res.json();
  },

  async deleteCookies() {
    const res = await fetch(`${this.baseUrl}/api/cookies`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete cookies");
    return res.json();
  },

  // Environment
  async getEnvironment() {
    const res = await fetch(`${this.baseUrl}/api/env`);
    if (!res.ok) throw new Error("Failed to get environment");
    return res.json();
  },

  // Server Queue
  async getServerQueue() {
    const res = await fetch(`${this.baseUrl}/api/queue/server`);
    if (!res.ok) {
      if (res.status === 401) throw new Error("Not authenticated");
      throw new Error("Failed to get server queue");
    }
    return res.json();
  },

  async saveServerQueue(queue) {
    const res = await fetch(`${this.baseUrl}/api/queue/server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue }),
    });
    if (!res.ok) throw new Error("Failed to save queue to server");
    return res.json();
  },

  async updateServerQueueItem(itemId, updates) {
    const res = await fetch(`${this.baseUrl}/api/queue/server/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update queue item");
    return res.json();
  },

  async deleteServerQueueItem(itemId) {
    const res = await fetch(`${this.baseUrl}/api/queue/server/${itemId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete queue item");
    return res.json();
  },

  async clearServerQueue() {
    const res = await fetch(`${this.baseUrl}/api/queue/server`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to clear server queue");
    return res.json();
  },

  async processSegment(
    videoId,
    startTime,
    endTime,
    segmentIndex,
    textOverlay = ""
  ) {
    const res = await fetch(`${this.baseUrl}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        startTime,
        endTime,
        segmentIndex,
        textOverlay,
      }),
    });
    if (!res.ok) throw new Error("Failed to process segment");
    return res.json();
  },

  async uploadSegment(segmentPath, title, description, tags, privacy) {
    const res = await fetch(`${this.baseUrl}/api/youtube/upload-segment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segmentPath,
        title,
        description,
        tags,
        privacyStatus: privacy,
      }),
    });
    if (!res.ok) throw new Error("Failed to upload");
    return res.json();
  },

  // Get direct video URL for client-side download fallback
  async getVideoUrl(videoId) {
    const res = await fetch(`${this.baseUrl}/api/video/get-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.details || "Failed to get video URL");
    }
    return res.json();
  },

  // Upload client-downloaded video to server
  async uploadClientVideo(videoId, videoBlob, onProgress) {
    const formData = new FormData();
    formData.append("videoId", videoId);
    formData.append("video", videoBlob, `${videoId}.mp4`);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/api/video/upload-client`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error("Failed to upload video to server"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error uploading video"));
      xhr.send(formData);
    });
  },

  // Upload processed segment blob directly for YouTube upload
  async uploadProcessedSegment(
    blob,
    title,
    description,
    tags,
    privacy,
    onProgress
  ) {
    const formData = new FormData();
    formData.append("video", blob, "segment.mp4");
    formData.append("title", title);
    formData.append("description", description || "");
    formData.append("tags", tags || "");
    formData.append("privacyStatus", privacy || "private");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/api/youtube/upload`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(
              new Error(JSON.parse(xhr.responseText).error || "Upload failed")
            );
          } catch {
            reject(new Error("Upload failed"));
          }
        }
      };

      xhr.onerror = () =>
        reject(new Error("Network error uploading to YouTube"));
      xhr.send(formData);
    });
  },

  // Check if video is already cached on server
  async checkVideoStatus(videoId) {
    const res = await fetch(`${this.baseUrl}/api/video/status/${videoId}`);
    if (!res.ok) throw new Error("Failed to check video status");
    return res.json();
  },
};

// ============ Client-Side Video Download ============
const ClientDownloader = {
  // Download video in browser and upload to server
  async downloadAndUpload(videoId, onProgress) {
    onProgress?.({ stage: "Getting video URL...", percent: 0 });

    let urlResult;

    // Try server-side yt-dlp first (works with residential IP)
    try {
      console.log("Trying server-side yt-dlp...");
      urlResult = await API.getVideoUrl(videoId);
      if (urlResult?.success) {
        console.log("✅ Got URL from yt-dlp");
      }
    } catch (e) {
      console.log("yt-dlp failed:", e.message);
    }

    // Fall back to Invidious if yt-dlp failed
    if (!urlResult?.success) {
      console.log("Falling back to Invidious...");
      urlResult = await ClientYouTube.getVideoUrl(videoId);
    }

    if (!urlResult?.success) {
      throw new Error("Could not get video URL");
    }

    onProgress?.({ stage: "Downloading video...", percent: 5 });

    // Step 2: Download video in browser
    const videoBlob = await this.fetchVideoBlob(
      urlResult.videoUrl,
      (percent) => {
        onProgress?.({
          stage: "Downloading video...",
          percent: 5 + percent * 0.7,
        });
      }
    );

    onProgress?.({ stage: "Uploading to server...", percent: 75 });

    // Step 3: Upload to server
    const uploadResult = await API.uploadClientVideo(
      videoId,
      videoBlob,
      (percent) => {
        onProgress?.({
          stage: "Uploading to server...",
          percent: 75 + percent * 0.25,
        });
      }
    );

    onProgress?.({ stage: "Complete!", percent: 100 });
    return uploadResult;
  },

  // Fetch video as blob with progress (uses proxy for external URLs)
  async fetchVideoBlob(url, onProgress) {
    // Check if URL is external (needs proxy)
    const isExternal =
      url.startsWith("http") && !url.startsWith(window.location.origin);

    // Use proxy for external URLs to bypass CORS
    const fetchUrl = isExternal
      ? `${API.baseUrl}/api/proxy?url=${encodeURIComponent(url)}`
      : url;

    console.log(`Fetching video: ${isExternal ? "(via proxy)" : "(direct)"}`);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      received += value.length;

      if (total > 0 && onProgress) {
        onProgress(Math.round((received / total) * 100));
      }
    }

    return new Blob(chunks, { type: "video/mp4" });
  },
};

// ============ FFmpeg.wasm Client-Side Processor ============
// Uses FFmpegWASM global from local assets (see scripts/download-ffmpeg.js)
const ClientFFmpeg = {
  ffmpeg: null,
  loaded: false,
  loading: false,

  // Initialize FFmpeg.wasm
  async load() {
    if (this.loaded) return true;
    if (this.loading) {
      // Wait for ongoing load
      while (this.loading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.loaded;
    }

    this.loading = true;
    try {
      // Check if FFmpegWASM is available (loaded from local assets)
      if (typeof FFmpegWASM === "undefined" || !FFmpegWASM.FFmpeg) {
        console.warn(
          "FFmpeg.wasm not loaded. Run: node scripts/download-ffmpeg.js"
        );
        this.loading = false;
        return false;
      }

      console.log("Creating FFmpeg instance...");
      this.ffmpeg = new FFmpegWASM.FFmpeg();

      // Log progress
      this.ffmpeg.on("log", ({ message }) => {
        console.log("[FFmpeg]", message);
      });

      this.ffmpeg.on("progress", ({ progress }) => {
        console.log(`[FFmpeg] Progress: ${(progress * 100).toFixed(1)}%`);
      });

      // Load FFmpeg core from local assets with timeout
      console.log("Loading FFmpeg core from local assets...");
      const loadPromise = this.ffmpeg.load({
        coreURL: "/assets/ffmpeg/ffmpeg-core.js",
        wasmURL: "/assets/ffmpeg/ffmpeg-core.wasm",
      });

      // 30 second timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("FFmpeg load timeout (30s)")), 30000)
      );

      await Promise.race([loadPromise, timeoutPromise]);

      this.loaded = true;
      console.log("✅ FFmpeg.wasm loaded successfully");
      return true;
    } catch (e) {
      console.error("Failed to load FFmpeg.wasm:", e);
      this.loading = false;
      return false;
    } finally {
      this.loading = false;
    }
  },

  // Process video segment entirely on client
  async processSegment(videoBlob, startTime, endTime, onProgress) {
    if (!this.loaded) {
      const loaded = await this.load();
      if (!loaded) throw new Error("FFmpeg.wasm not available");
    }

    const duration = endTime - startTime;
    onProgress?.({ stage: "Preparing video...", percent: 10 });

    // Write input video to FFmpeg virtual filesystem
    const inputData = new Uint8Array(await videoBlob.arrayBuffer());
    await this.ffmpeg.writeFile("input.mp4", inputData);

    onProgress?.({ stage: "Cutting segment...", percent: 30 });

    // Set up progress handler
    this.ffmpeg.on("progress", ({ progress }) => {
      const percent = 30 + Math.round(progress * 60);
      onProgress?.({ stage: "Processing...", percent: Math.min(percent, 90) });
    });

    // Cut the segment
    // Using fast seek (-ss before -i) and accurate cut
    await this.ffmpeg.exec([
      "-ss",
      String(startTime),
      "-i",
      "input.mp4",
      "-t",
      String(duration),
      "-c:v",
      "copy", // Copy video codec (fast, no re-encoding)
      "-c:a",
      "copy", // Copy audio codec (fast)
      "-avoid_negative_ts",
      "make_zero",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);

    onProgress?.({ stage: "Finalizing...", percent: 95 });

    // Read the output file
    const outputData = await this.ffmpeg.readFile("output.mp4");

    // Clean up virtual filesystem
    await this.ffmpeg.deleteFile("input.mp4");
    await this.ffmpeg.deleteFile("output.mp4");

    onProgress?.({ stage: "Complete!", percent: 100 });

    return new Blob([outputData.buffer], { type: "video/mp4" });
  },

  // Check if FFmpeg.wasm is supported in this browser
  // Single-threaded mode works without SharedArrayBuffer
  isSupported() {
    // FFmpeg global is loaded async, so we check more loosely
    // The actual load() will fail gracefully if not supported
    return typeof WebAssembly !== "undefined";
  },
};

// ============ Client-Side YouTube URL Extraction ============
// Uses Invidious API (via server proxy to bypass CORS)
const ClientYouTube = {
  // List of public Invidious instances with API enabled (updated regularly)
  // Check https://api.invidious.io/ for current list
  instances: [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://invidious.f5.si",
    "https://inv.perditum.com",
    "https://yewtu.be",
  ],

  // Check if response is a Cloudflare challenge page
  isCloudflareChallenge(text) {
    return (
      text.includes("Just a moment...") ||
      text.includes("_cf_chl_opt") ||
      text.includes("challenge-platform")
    );
  },

  // Show challenge to user in popup and wait for completion
  async handleCloudflareChallenge(url, instance) {
    return new Promise((resolve, reject) => {
      // Show modal to user
      const modal = document.createElement("div");
      modal.id = "cf-challenge-modal";
      modal.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;">
          <div style="background:#1a1a2e;border-radius:12px;padding:20px;max-width:600px;width:100%;color:white;">
            <h3 style="margin:0 0 10px 0;">⚠️ Cloudflare Challenge</h3>
            <p style="margin:0 0 15px 0;color:#aaa;">
              The Invidious instance <strong>${instance}</strong> requires verification.
              Click the button below to complete the challenge in a new tab, then click "Done" when finished.
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button id="cf-open-btn" style="flex:1;min-width:120px;padding:12px;background:#4a90d9;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
                🔗 Open Challenge
              </button>
              <button id="cf-done-btn" style="flex:1;min-width:120px;padding:12px;background:#2ecc71;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
                ✅ Retry (Direct)
              </button>
              <button id="cf-proxy-btn" style="flex:1;min-width:120px;padding:12px;background:#9b59b6;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
                🔄 Retry (Proxy)
              </button>
              <button id="cf-skip-btn" style="flex:1;min-width:120px;padding:12px;background:#666;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
                ⏭️ Skip Instance
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Open challenge URL directly (not proxied)
      document.getElementById("cf-open-btn").onclick = () => {
        window.open(url, "_blank", "width=600,height=700");
      };

      // Retry with direct fetch (browser has cookies now)
      document.getElementById("cf-done-btn").onclick = () => {
        modal.remove();
        resolve("retry-direct");
      };

      // Retry via proxy (in case challenge was IP-based)
      document.getElementById("cf-proxy-btn").onclick = () => {
        modal.remove();
        resolve("retry-proxy");
      };

      // Skip this instance
      document.getElementById("cf-skip-btn").onclick = () => {
        modal.remove();
        resolve("skip");
      };
    });
  },

  async getVideoUrl(videoId) {
    let lastError = null;

    for (const instance of this.instances) {
      let retries = 0;
      const maxRetries = 2;

      while (retries < maxRetries) {
        try {
          console.log(`Trying Invidious instance (via proxy): ${instance}`);

          // Use server proxy to bypass CORS
          const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`;
          const response = await fetch(
            `${API.baseUrl}/api/proxy?url=${encodeURIComponent(apiUrl)}`,
            { signal: AbortSignal.timeout(15000) }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          // Get text first to check for Cloudflare challenge
          const text = await response.text();

          // Check if it's a Cloudflare challenge
          if (this.isCloudflareChallenge(text)) {
            console.log(`⚠️ Cloudflare challenge detected for ${instance}`);
            const action = await this.handleCloudflareChallenge(
              apiUrl,
              instance
            );

            if (action === "retry-proxy") {
              // Retry via proxy (challenge might have been IP-based)
              console.log("Retrying via proxy...");
              retries++;
              continue;
            } else if (action === "retry-direct") {
              // Try direct fetch (browser now has cookies from completing challenge)
              console.log(
                "Retrying with direct fetch (using browser cookies)..."
              );
              try {
                const directResponse = await fetch(apiUrl, {
                  credentials: "include",
                  signal: AbortSignal.timeout(15000),
                });
                if (directResponse.ok) {
                  text = await directResponse.text();
                  if (!this.isCloudflareChallenge(text)) {
                    // Success! Continue to parse JSON below
                    console.log("✅ Direct fetch succeeded after challenge");
                  } else {
                    throw new Error("Still getting challenge");
                  }
                } else {
                  throw new Error(`HTTP ${directResponse.status}`);
                }
              } catch (directErr) {
                console.log(
                  "Direct fetch failed (likely CORS):",
                  directErr.message
                );
                retries++;
                continue;
              }
            } else {
              break; // Skip to next instance
            }
          }

          // Parse JSON
          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            throw new Error("Invalid JSON response");
          }

          // Try to get best MP4 format from formatStreams (combined audio+video)
          const formats = data.formatStreams || [];
          const mp4Format = formats.find((f) => f.container === "mp4" && f.url);

          if (mp4Format?.url) {
            console.log(`✅ Got video URL from ${instance}`);
            return {
              success: true,
              videoUrl: mp4Format.url,
              source: "invidious",
              instance: instance,
            };
          }

          // Fallback to adaptive formats
          const adaptiveFormats = data.adaptiveFormats || [];
          const videoFormat = adaptiveFormats.find(
            (f) => f.container === "mp4" && f.type?.includes("video") && f.url
          );

          if (videoFormat?.url) {
            console.log(`✅ Got adaptive video URL from ${instance}`);
            return {
              success: true,
              videoUrl: videoFormat.url,
              source: "invidious-adaptive",
              instance: instance,
            };
          }

          throw new Error("No suitable format found");
        } catch (e) {
          console.log(`Instance ${instance} failed:`, e.message);
          lastError = e;
          break; // Move to next instance on error
        }
      }
    }

    throw new Error(`All Invidious instances failed: ${lastError?.message}`);
  },
};

// ============ Full Client-Side Processing ============
// Downloads video via server proxy and processes with FFmpeg.wasm in browser
const ClientProcessor = {
  async processSegment(videoId, startTime, endTime, onProgress) {
    // Step 1: Get video URL - try yt-dlp first, then Invidious
    onProgress?.({ stage: "Getting video URL...", percent: 5 });

    let urlResult;

    // Try server-side yt-dlp first (works with residential IP)
    try {
      console.log("Trying server-side yt-dlp...");
      urlResult = await API.getVideoUrl(videoId);
      if (urlResult?.success) {
        console.log("✅ Got URL from yt-dlp");
      }
    } catch (e) {
      console.log("yt-dlp failed:", e.message);
    }

    // Fall back to Invidious if yt-dlp failed
    if (!urlResult?.success) {
      console.log("Falling back to Invidious...");
      urlResult = await ClientYouTube.getVideoUrl(videoId);
    }

    if (!urlResult?.success) {
      throw new Error("Could not get video URL");
    }

    // Step 2: Download video in browser
    onProgress?.({ stage: "Downloading video...", percent: 10 });

    const videoBlob = await ClientDownloader.fetchVideoBlob(
      urlResult.videoUrl,
      (percent) => {
        onProgress?.({
          stage: "Downloading video...",
          percent: 10 + percent * 0.4,
        });
      }
    );

    // Step 3: Process with FFmpeg.wasm
    onProgress?.({ stage: "Loading FFmpeg...", percent: 50 });

    const processedBlob = await ClientFFmpeg.processSegment(
      videoBlob,
      startTime,
      endTime,
      (progress) => {
        onProgress?.({
          stage: progress.stage,
          percent: 50 + (progress.percent - 10) * 0.4,
        });
      }
    );

    // Step 4: Return the processed blob (can be uploaded or previewed)
    onProgress?.({ stage: "Complete!", percent: 100 });

    return {
      success: true,
      blob: processedBlob,
      url: URL.createObjectURL(processedBlob),
      clientProcessed: true,
    };
  },
};

// ============ Video Download with Fallback ============
// Ensures video is available on server, using client-side download as fallback
async function ensureVideoDownloaded(videoId, onProgress) {
  // First check if already cached on server
  try {
    const status = await API.checkVideoStatus(videoId);
    if (status.status === "ready") {
      onProgress?.({ stage: "Video already cached", percent: 100 });
      return { success: true, cached: true, videoUrl: status.videoUrl };
    }
  } catch (e) {
    console.log("Could not check video status:", e.message);
  }

  // Try server-side download first (might work for some videos)
  onProgress?.({ stage: "Trying server download...", percent: 10 });

  try {
    const res = await fetch(`${API.baseUrl}/api/video/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success) {
        onProgress?.({ stage: "Downloaded on server", percent: 100 });
        return {
          success: true,
          cached: result.cached,
          videoUrl: result.videoUrl,
        };
      }
    }

    // Check if the error indicates blocking
    const errorData = await res.json().catch(() => ({}));
    if (
      errorData.details?.includes("403") ||
      errorData.details?.includes("Sign in")
    ) {
      console.log("Server download blocked, trying client fallback...");
    } else {
      throw new Error(errorData.error || "Server download failed");
    }
  } catch (e) {
    console.log("Server download failed:", e.message);
    // Continue to client fallback
  }

  // Fallback: Client-side download
  onProgress?.({ stage: "Using client download (your IP)...", percent: 15 });
  showToast(
    "info",
    "Fallback",
    "Server blocked - downloading through your browser..."
  );

  try {
    const result = await ClientDownloader.downloadAndUpload(
      videoId,
      onProgress
    );
    return {
      success: true,
      cached: false,
      videoUrl: result.videoUrl,
      clientDownload: true,
    };
  } catch (e) {
    throw new Error(`Client download also failed: ${e.message}`);
  }
}

// Process segment with automatic fallback strategy:
// 1. Try server-side processing (if video cached and server fast)
// 2. Fall back to full client-side processing (FFmpeg.wasm)
async function processSegmentWithFallback(
  videoId,
  start,
  end,
  segmentIndex,
  overlayText,
  onProgress
) {
  // Check if client-side processing is preferred or required
  const useClientProcessing =
    localStorage.getItem("preferClientProcessing") === "true";
  const ffmpegSupported = ClientFFmpeg.isSupported();

  // Try server-side first if video is already cached
  if (!useClientProcessing) {
    try {
      const status = await API.checkVideoStatus(videoId);
      if (status.status === "ready") {
        onProgress?.({ stage: "Processing on server...", percent: 50 });
        const result = await API.processSegment(
          videoId,
          start,
          end,
          segmentIndex,
          overlayText
        );
        if (result.success) {
          onProgress?.({ stage: "Complete!", percent: 100 });
          return result;
        }
      }
    } catch (e) {
      console.log("Server processing failed:", e.message);
    }
  }

  // Client-side processing with FFmpeg.wasm
  if (ffmpegSupported) {
    onProgress?.({
      stage: "Using local processing (FFmpeg.wasm)...",
      percent: 5,
    });
    showToast("info", "Local Processing", "Processing video on your device...");

    try {
      const result = await ClientProcessor.processSegment(
        videoId,
        start,
        end,
        onProgress
      );

      if (result.success) {
        // Store the blob URL for preview/upload
        // Generate a unique filename
        const filename = `${videoId}_${segmentIndex}_${Date.now()}.mp4`;

        return {
          success: true,
          filename: filename,
          blob: result.blob,
          blobUrl: result.url,
          cached: false,
          clientProcessed: true,
        };
      }
    } catch (e) {
      console.error("Client processing failed:", e);
      showToast("warning", "Local processing failed", e.message);
    }
  }

  // Final fallback: ensure video downloaded and try server processing
  onProgress?.({ stage: "Downloading video...", percent: 10 });
  await ensureVideoDownloaded(videoId, onProgress);

  onProgress?.({ stage: "Processing on server...", percent: 80 });
  const result = await API.processSegment(
    videoId,
    start,
    end,
    segmentIndex,
    overlayText
  );

  onProgress?.({ stage: "Complete!", percent: 100 });
  return result;
}

// ============ DOM Elements ============
const DOM = {
  // Auth
  authBtn: document.getElementById("auth-btn"),

  // Search
  channelSearch: document.getElementById("channel-search"),
  searchBtn: document.getElementById("search-btn"),
  channelResults: document.getElementById("channel-results"),
  selectedChannel: document.getElementById("selected-channel"),

  // Video Search
  videoSearch: document.getElementById("video-search"),

  // Videos
  videoList: document.getElementById("video-list"),
  filterTabs: document.querySelectorAll(".filter-tab"),
  pagination: document.getElementById("pagination"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  pageInfo: document.getElementById("page-info"),

  // Editor
  editorPlaceholder: document.getElementById("editor-placeholder"),
  videoEditor: document.getElementById("video-editor"),
  youtubePlayer: document.getElementById("youtube-player"),
  currentTime: document.getElementById("current-time"),
  totalDuration: document.getElementById("total-duration"),
  playPause: document.getElementById("play-pause"),
  seekBack: document.getElementById("seek-back"),
  seekForward: document.getElementById("seek-forward"),
  addSeamBtn: document.getElementById("add-seam-btn"),

  // Timeline
  timeline: document.getElementById("timeline"),
  timelineProgress: document.getElementById("timeline-progress"),
  timelineSeams: document.getElementById("timeline-seams"),
  timelineCursor: document.getElementById("timeline-cursor"),

  // Segments
  segmentsList: document.getElementById("segments-list"),
  videoTitleOverride: document.getElementById("video-title-override"),
  saveSeamsBtn: document.getElementById("save-seams-btn"),
  markFinishedBtn: document.getElementById("mark-finished-btn"),
  ignoreVideoBtn: document.getElementById("ignore-video-btn"),

  // Preview Modal
  previewModal: document.getElementById("preview-modal"),
  previewVideo: document.getElementById("preview-video"),
  previewSegmentName: document.getElementById("preview-segment-name"),
  previewSegmentDuration: document.getElementById("preview-segment-duration"),
  previewLoading: document.getElementById("preview-loading"),
  previewCacheStatus: document.getElementById("preview-cache-status"),
  previewUploadBtn: document.getElementById("preview-upload-btn"),
  closePreviewBtn: document.getElementById("close-preview-btn"),

  // Upload
  uploadAuthRequired: document.getElementById("upload-auth-required"),
  uploadControls: document.getElementById("upload-controls"),
  uploadAuthBtn: document.getElementById("upload-auth-btn"),
  uploadTitle: document.getElementById("upload-title"),
  uploadDescription: document.getElementById("upload-description"),
  uploadTags: document.getElementById("upload-tags"),
  uploadPrivacy: document.getElementById("upload-privacy"),
  preferLocalProcessing: document.getElementById("prefer-local-processing"),
  segmentsUploadList: document.getElementById("segments-upload-list"),
  addAllToQueueBtn: document.getElementById("add-all-to-queue-btn"),

  // Sidebars
  leftSidebar: document.getElementById("left-sidebar"),
  toggleSidebarBtn: document.getElementById("toggle-sidebar-btn"),

  // Queue
  queueSidebar: document.getElementById("queue-sidebar"),
  queueCount: document.getElementById("queue-count"),
  queueList: document.getElementById("queue-list"),
  processQueueBtn: document.getElementById("process-queue-btn"),
  clearQueueBtn: document.getElementById("clear-queue-btn"),
  toggleQueueBtn: document.getElementById("toggle-queue-btn"),
  sendToServerBtn: document.getElementById("send-to-server-btn"),
  viewServerQueueBtn: document.getElementById("view-server-queue-btn"),
  serverQueueBadge: document.getElementById("server-queue-badge"),

  // Server Queue Modal
  serverQueueModal: document.getElementById("server-queue-modal"),
  serverQueueList: document.getElementById("server-queue-list"),
  serverQueueStatus: document.getElementById("server-queue-status"),
  closeServerQueueBtn: document.getElementById("close-server-queue-btn"),
  refreshServerQueueBtn: document.getElementById("refresh-server-queue-btn"),
  importServerQueueBtn: document.getElementById("import-server-queue-btn"),
  processServerQueueBtn: document.getElementById("process-server-queue-btn"),
  clearServerQueueBtn: document.getElementById("clear-server-queue-btn"),

  // Queue Edit Modal
  queueEditModal: document.getElementById("queue-edit-modal"),
  queueEditId: document.getElementById("queue-edit-id"),
  queueEditTitle: document.getElementById("queue-edit-title"),
  queueEditSegmentName: document.getElementById("queue-edit-segment-name"),
  queueEditPrivacy: document.getElementById("queue-edit-privacy"),
  queueEditDescription: document.getElementById("queue-edit-description"),
  queueEditTags: document.getElementById("queue-edit-tags"),
  queueEditOverlay: document.getElementById("queue-edit-overlay"),
  queueEditStart: document.getElementById("queue-edit-start"),
  queueEditEnd: document.getElementById("queue-edit-end"),
  queueEditDuration: document.getElementById("queue-edit-duration"),
  queueEditSaveBtn: document.getElementById("queue-edit-save-btn"),
  queueEditCancelBtn: document.getElementById("queue-edit-cancel-btn"),
  closeQueueEditBtn: document.getElementById("close-queue-edit-btn"),

  // Toast
  toastContainer: document.getElementById("toast-container"),
};

// ============ Utility Functions ============
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

function parseDuration(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationShort(isoDuration) {
  const totalSeconds = parseDuration(isoDuration);
  return formatTime(totalSeconds);
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ============ Toast Notifications ============
function showToast(type, title, message) {
  const icons = {
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${icons[type]}
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ""}
    </div>
    <button class="toast-close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  toast.querySelector(".toast-close").onclick = () => toast.remove();
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4000);
}

// ============ Auth Functions ============
async function checkAuthStatus() {
  try {
    state.authenticated = await API.checkAuth();
    updateAuthUI();
  } catch (e) {
    console.error("Auth check failed:", e);
  }
}

function updateAuthUI() {
  if (state.authenticated) {
    DOM.authBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Connected</span>
    `;
    DOM.authBtn.classList.add("authenticated");
    DOM.uploadAuthRequired.classList.add("hidden");
    DOM.uploadControls.classList.remove("hidden");
  } else {
    DOM.authBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
      <span>Sign In</span>
    `;
    DOM.authBtn.classList.remove("authenticated");
    DOM.uploadAuthRequired.classList.remove("hidden");
    DOM.uploadControls.classList.add("hidden");
  }
}

async function handleAuth() {
  if (state.authenticated) {
    try {
      await API.logout();
    } catch (e) {
      console.error("Logout API error:", e);
    }
    state.authenticated = false;
    updateAuthUI();
    showToast("info", "Signed out", "Disconnected from YouTube");
  } else {
    try {
      const url = await API.getAuthUrl();
      window.location.href = url;
    } catch (e) {
      showToast("error", "Auth failed", "Could not get authentication URL");
    }
  }
}

// ============ Channel Functions ============
async function searchChannels() {
  const query = DOM.channelSearch.value.trim();
  if (!query) return;

  try {
    DOM.channelResults.innerHTML =
      '<div class="empty-state"><p>Searching...</p></div>';
    const channels = await API.searchChannels(query);
    renderChannelResults(channels);
  } catch (e) {
    showToast("error", "Search failed", e.message);
    DOM.channelResults.innerHTML = "";
  }
}

function renderChannelResults(channels) {
  if (!channels.length) {
    DOM.channelResults.innerHTML =
      '<div class="empty-state"><p>No channels found</p></div>';
    return;
  }

  DOM.channelResults.innerHTML = channels
    .map(
      (ch) => `
    <div class="channel-item" data-channel-id="${ch.id.channelId}">
      <img src="${ch.snippet.thumbnails.default.url}" alt="${ch.snippet.title}">
      <div class="channel-item-info">
        <h4>${ch.snippet.title}</h4>
        <p>${
          ch.snippet.description?.substring(0, 40) || "YouTube Channel"
        }...</p>
      </div>
    </div>
  `
    )
    .join("");

  DOM.channelResults.querySelectorAll(".channel-item").forEach((item) => {
    item.onclick = () => selectChannel(item.dataset.channelId, channels);
  });
}

async function selectChannel(channelId, channels) {
  const channel = channels.find((ch) => ch.id.channelId === channelId);
  if (!channel) return;

  state.selectedChannel = {
    id: channelId,
    title: channel.snippet.title,
    thumbnail: channel.snippet.thumbnails.default.url,
  };

  StorageManager.saveSelectedChannel(state.selectedChannel);

  DOM.channelResults.classList.add("hidden");
  DOM.selectedChannel.classList.remove("hidden");
  DOM.selectedChannel.innerHTML = `
    <img src="${state.selectedChannel.thumbnail}" alt="${state.selectedChannel.title}">
    <div class="selected-channel-info">
      <h4>${state.selectedChannel.title}</h4>
      <p>Selected channel</p>
    </div>
    <button class="clear-btn" onclick="clearChannel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  await loadChannelVideos();
}

function clearChannel() {
  state.selectedChannel = null;
  state.videos = [];
  StorageManager.clearSelectedChannel();

  DOM.selectedChannel.classList.add("hidden");
  DOM.channelResults.classList.remove("hidden");
  DOM.channelResults.innerHTML = "";
  DOM.channelSearch.value = "";
  renderVideoList();
}

async function loadChannelVideos(pageToken = null) {
  if (!state.selectedChannel) return;

  try {
    const data = await API.getChannelVideos(
      state.selectedChannel.id,
      pageToken
    );
    state.videos = data.videos;
    state.pagination.nextToken = data.nextPageToken;
    state.pagination.prevToken = data.prevPageToken;
    renderVideoList();
    updatePagination();
  } catch (e) {
    showToast("error", "Failed to load videos", e.message);
  }
}

// ============ Video List Functions ============
function renderVideoList() {
  const finishedVideos = StorageManager.getFinishedVideos();
  const ignoredVideos = StorageManager.getIgnoredVideos();
  const searchQuery = state.videoSearchQuery.toLowerCase();

  let filteredVideos = state.videos;

  // Apply search filter
  if (searchQuery) {
    filteredVideos = filteredVideos.filter((v) =>
      v.title.toLowerCase().includes(searchQuery)
    );
  }

  // Apply status filter
  if (state.currentFilter === "finished") {
    filteredVideos = filteredVideos.filter((v) =>
      finishedVideos.includes(v.id)
    );
  } else if (state.currentFilter === "pending") {
    filteredVideos = filteredVideos.filter(
      (v) => !finishedVideos.includes(v.id) && !ignoredVideos.includes(v.id)
    );
  } else if (state.currentFilter === "ignored") {
    filteredVideos = filteredVideos.filter((v) => ignoredVideos.includes(v.id));
  } else {
    // "all" filter - hide ignored by default unless searching
    if (!searchQuery) {
      filteredVideos = filteredVideos.filter(
        (v) => !ignoredVideos.includes(v.id)
      );
    }
  }

  if (!filteredVideos.length) {
    DOM.videoList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <path d="M7 2v20"></path>
          <path d="M17 2v20"></path>
          <path d="M2 12h20"></path>
        </svg>
        <p>${
          state.selectedChannel
            ? searchQuery
              ? "No videos match your search"
              : "No videos match this filter"
            : "Search for a channel to see videos"
        }</p>
      </div>
    `;
    return;
  }

  DOM.videoList.innerHTML = filteredVideos
    .map((video) => {
      const isFinished = finishedVideos.includes(video.id);
      const isIgnored = ignoredVideos.includes(video.id);
      const isActive = state.selectedVideo?.id === video.id;

      let statusClass = "";
      if (isFinished) statusClass = "finished";
      else if (isIgnored) statusClass = "ignored";

      return `
      <div class="video-item ${statusClass} ${isActive ? "active" : ""}" 
           data-video-id="${video.id}">
        <div class="video-item-thumb">
          <img src="${video.thumbnail}" alt="${video.title}">
          <span class="duration">${formatDurationShort(video.duration)}</span>
        </div>
        <div class="video-item-info">
          <h4>${video.title}</h4>
          <div class="video-item-meta">
            ${formatNumber(parseInt(video.viewCount))} views
          </div>
        </div>
        <div class="video-item-actions">
          <button onclick="event.stopPropagation(); toggleIgnoreVideo('${
            video.id
          }')" title="${isIgnored ? "Unignore" : "Ignore"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${
                isIgnored
                  ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
                  : '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>'
              }
            </svg>
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  DOM.videoList.querySelectorAll(".video-item").forEach((item) => {
    item.onclick = (e) => {
      if (!e.target.closest(".video-item-actions")) {
        selectVideo(item.dataset.videoId);
      }
    };
  });
}

function updatePagination() {
  const hasPages = state.pagination.nextToken || state.pagination.prevToken;
  DOM.pagination.classList.toggle("hidden", !hasPages);
  DOM.prevPage.disabled = !state.pagination.prevToken;
  DOM.nextPage.disabled = !state.pagination.nextToken;
}

// ============ Video Editor Functions ============
async function selectVideo(videoId) {
  const video = state.videos.find((v) => v.id === videoId);
  if (!video) return;

  state.selectedVideo = video;
  state.duration = parseDuration(video.duration);

  // Load saved seams and title override
  const savedData = StorageManager.getSeams(videoId);
  if (savedData && savedData.seams.length) {
    state.seams = savedData.seams;
    state.segmentNames = savedData.segmentNames;
    state.textOverlays = savedData.textOverlays;
    // Use saved title override, or default to YouTube title
    state.videoTitleOverride = savedData.videoTitleOverride || video.title;
  } else {
    state.seams = [{ time: 0, label: "Start" }];
    state.segmentNames = [];
    state.textOverlays = [];
    // Default to YouTube video title
    state.videoTitleOverride = video.title;
  }

  // Ensure there's always a seam at the end
  ensureEndSeam();

  DOM.editorPlaceholder.classList.add("hidden");
  DOM.videoEditor.classList.remove("hidden");

  // Update UI
  DOM.totalDuration.textContent = formatTime(state.duration);
  updateTimeline();
  renderSegmentsList();
  renderVideoList();
  updateMarkFinishedButton();
  updateIgnoreButton();
  closePreview();

  // Load YouTube video
  loadYouTubeVideo(videoId);
}

function loadYouTubeVideo(videoId) {
  if (state.player) {
    // If player exists, just load new video
    state.player.loadVideoById(videoId);
  } else {
    // Create new player
    state.player = new YT.Player("youtube-player", {
      height: "100%",
      width: "100%",
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 1,
        playsinline: 1,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });
  }
}

function onPlayerReady(event) {
  state.playerReady = true;

  // Get video duration from player (more accurate than API)
  const playerDuration = state.player.getDuration();
  if (playerDuration > 0) {
    state.duration = playerDuration;
    DOM.totalDuration.textContent = formatTime(state.duration);
    updateTimeline();
  }

  // Start time tracking interval
  if (state.playerIntervalId) {
    clearInterval(state.playerIntervalId);
  }
  state.playerIntervalId = setInterval(updateCurrentTime, 100);
}

function onPlayerStateChange(event) {
  // YT.PlayerState: UNSTARTED (-1), ENDED (0), PLAYING (1), PAUSED (2), BUFFERING (3), CUED (5)
  state.isPlaying = event.data === YT.PlayerState.PLAYING;
  updatePlayPauseButton();
}

function updateCurrentTime() {
  if (!state.playerReady || !state.player) return;

  try {
    state.currentTime = state.player.getCurrentTime() || 0;
    DOM.currentTime.textContent = formatTime(state.currentTime);

    if (state.duration > 0) {
      const percent = (state.currentTime / state.duration) * 100;
      DOM.timelineCursor.style.left = `${percent}%`;
      DOM.timelineProgress.style.width = `${percent}%`;
    }
  } catch (e) {
    // Player might not be ready
  }
}

// YouTube IFrame API callback (called automatically when API loads)
function onYouTubeIframeAPIReady() {
  console.log("YouTube IFrame API ready");
}

function updatePlayPauseButton() {
  const playIcon = DOM.playPause.querySelector(".play-icon");
  const pauseIcon = DOM.playPause.querySelector(".pause-icon");

  if (state.isPlaying) {
    playIcon.classList.add("hidden");
    pauseIcon.classList.remove("hidden");
  } else {
    playIcon.classList.remove("hidden");
    pauseIcon.classList.add("hidden");
  }
}

function togglePlayPause() {
  if (!state.playerReady || !state.player) return;

  if (state.isPlaying) {
    state.player.pauseVideo();
  } else {
    state.player.playVideo();
  }
}

function seekRelative(seconds) {
  if (!state.playerReady || !state.player) return;

  const currentTime = state.player.getCurrentTime() || 0;
  const newTime = Math.max(0, Math.min(state.duration, currentTime + seconds));
  state.player.seekTo(newTime, true);
}

function seekTo(time) {
  if (!state.playerReady || !state.player) return;

  state.player.seekTo(time, true);
}

// ============ Timeline Functions ============
function updateTimeline() {
  DOM.timelineSeams.innerHTML = "";

  if (state.duration <= 0) return;

  // Add segment blocks
  for (let i = 0; i < state.seams.length - 1; i++) {
    const start = state.seams[i].time;
    const end = state.seams[i + 1].time;
    const leftPercent = (start / state.duration) * 100;
    const widthPercent = ((end - start) / state.duration) * 100;

    const block = document.createElement("div");
    block.className = "segment-block";
    block.style.left = `${leftPercent}%`;
    block.style.width = `${widthPercent}%`;
    block.textContent = i + 1;
    DOM.timelineSeams.appendChild(block);
  }

  // Add seam markers
  state.seams.forEach((seam, index) => {
    const isStart = index === 0;
    const isEnd = index === state.seams.length - 1;
    const marker = document.createElement("div");
    marker.className = `seam-marker ${isStart ? "start" : ""} ${
      isEnd ? "end" : ""
    }`;
    marker.style.left = `${(seam.time / state.duration) * 100}%`;
    marker.dataset.index = isStart ? "S" : isEnd ? "E" : index;

    // Only allow dragging middle seams (not start or end)
    if (index > 0 && index < state.seams.length - 1) {
      marker.addEventListener("mousedown", (e) => startDraggingSeam(e, index));
    }

    marker.addEventListener("click", () => seekTo(seam.time));
    DOM.timelineSeams.appendChild(marker);
  });
}

function startDraggingSeam(e, index) {
  e.preventDefault();
  state.isDraggingSeam = true;
  state.draggedSeamIndex = index;

  document.addEventListener("mousemove", handleSeamDrag);
  document.addEventListener("mouseup", stopDraggingSeam);
}

function handleSeamDrag(e) {
  if (!state.isDraggingSeam || state.draggedSeamIndex === null) return;

  const rect = DOM.timeline.getBoundingClientRect();
  const percent = Math.max(
    0,
    Math.min(1, (e.clientX - rect.left) / rect.width)
  );
  const newTime = percent * state.duration;

  const draggedSeam = state.seams[state.draggedSeamIndex];
  draggedSeam.time = newTime;
  state.seams.sort((a, b) => a.time - b.time);
  state.draggedSeamIndex = state.seams.indexOf(draggedSeam);

  updateTimeline();
  renderSegmentsList();
}

function stopDraggingSeam() {
  state.isDraggingSeam = false;
  state.draggedSeamIndex = null;
  document.removeEventListener("mousemove", handleSeamDrag);
  document.removeEventListener("mouseup", stopDraggingSeam);
}

function handleTimelineClick(e) {
  if (state.isDraggingSeam) return;

  const rect = DOM.timeline.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  const time = percent * state.duration;
  seekTo(time);
}

function ensureEndSeam() {
  // Check if there's a seam at or very close to the end
  const endSeamExists = state.seams.some(
    (s) => Math.abs(s.time - state.duration) < 0.5
  );

  if (!endSeamExists && state.duration > 0) {
    state.seams.push({ time: state.duration, label: "End" });
    state.seams.sort((a, b) => a.time - b.time);
  }
}

function addSeam() {
  const newSeam = {
    time: state.currentTime,
    label: `Seam ${state.seams.length}`,
  };
  state.seams.push(newSeam);
  state.seams.sort((a, b) => a.time - b.time);

  updateTimeline();
  renderSegmentsList();
  showToast("success", "Seam added", `at ${formatTime(state.currentTime)}`);
}

function deleteSeam(index) {
  // Can't delete first seam (start) or last seam (end)
  if (index === 0 || index === state.seams.length - 1) return;

  state.seams.splice(index, 1);
  state.segmentNames.splice(index - 1, 1);
  state.textOverlays.splice(index - 1, 1);

  updateTimeline();
  renderSegmentsList();
  showToast("info", "Seam deleted");
}

// ============ Segments List Functions ============
function renderSegmentsList() {
  // Update video title input
  DOM.videoTitleOverride.value = state.videoTitleOverride || "";

  if (state.seams.length < 2) {
    DOM.segmentsList.innerHTML =
      '<div class="empty-segments"><p>Add seams to create segments</p></div>';
    renderUploadList();
    return;
  }

  DOM.segmentsList.innerHTML = "";

  for (let i = 0; i < state.seams.length - 1; i++) {
    const start = state.seams[i].time;
    const end = state.seams[i + 1].time;
    const duration = end - start;
    const isLong = duration > 180;

    const card = document.createElement("div");
    card.className = `segment-card${isLong ? " segment-too-long" : ""}`;
    card.innerHTML = `
      <div class="segment-card-header">
        <span class="segment-number">Segment ${i + 1}</span>
        <span class="segment-duration ${isLong ? "warning" : ""}">${formatTime(
      duration
    )}</span>
      </div>
      ${
        isLong
          ? `<div class="segment-warning">⚠️ Segment longer than 3 minutes - not suitable for Shorts</div>`
          : ""
      }
      <input type="text" 
             value="${state.segmentNames[i] || `Part ${i + 1}`}" 
             placeholder="Segment name..."
             data-index="${i}" 
             data-field="name">
      <div class="segment-card-times">
        <span>${formatTime(start)}</span>
        <span>→</span>
        <span>${formatTime(end)}</span>
      </div>
      <input type="text" 
             value="${state.textOverlays[i] || ""}" 
             placeholder="Add animated text..."
             data-index="${i}" 
             data-field="overlay">
      <div class="segment-card-actions">
        <button class="btn btn-small" onclick="seekTo(${start})" title="Go to start">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Play
        </button>
        <button class="btn btn-small btn-primary" onclick="previewSegment(${i})" title="Preview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          Preview
        </button>
        <button class="btn btn-small" onclick="deleteSeam(${
          i + 1
        })" title="Delete" style="background: var(--error);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    DOM.segmentsList.appendChild(card);
  }

  // Add event listeners for inputs
  DOM.segmentsList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (e) => {
      const index = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;

      if (field === "name") {
        state.segmentNames[index] = e.target.value;
      } else if (field === "overlay") {
        state.textOverlays[index] = e.target.value;
      }
    });
  });

  renderUploadList();
}

function renderUploadList() {
  if (state.seams.length < 2) {
    DOM.segmentsUploadList.innerHTML =
      '<p style="color: var(--text-muted); text-align: center; font-size: 0.8rem;">No segments to upload</p>';
    return;
  }

  DOM.segmentsUploadList.innerHTML = "";

  for (let i = 0; i < state.seams.length - 1; i++) {
    const start = state.seams[i].time;
    const end = state.seams[i + 1].time;
    const duration = end - start;
    const name = state.segmentNames[i] || `Segment ${i + 1}`;

    const item = document.createElement("div");
    item.className = "segment-upload-item";
    item.innerHTML = `
      <div class="segment-info">
        <div class="segment-name">${name}</div>
        <div class="segment-duration">${formatTime(duration)}</div>
      </div>
      <div class="segment-upload-actions">
        <button class="btn btn-small btn-secondary local-only" onclick="previewSegment(${i})" title="Preview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="btn btn-small btn-accent" onclick="addToQueue(${i})" title="Add to queue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Queue
        </button>
        <button class="btn btn-small btn-primary local-only" onclick="uploadSegment(${i})" title="Upload directly">Upload</button>
      </div>
    `;

    DOM.segmentsUploadList.appendChild(item);
  }
}

// ============ Preview Functions ============
async function previewSegment(index) {
  const start = state.seams[index].time;
  const end = state.seams[index + 1].time;
  const duration = end - start;
  const segmentName = state.segmentNames[index] || `Segment ${index + 1}`;
  const extraText = state.textOverlays[index] || "";
  const videoId = state.selectedVideo.id;

  // Construct full overlay text (like v1): Title + Segment Name + Extra Text
  const overlayLines = [];
  if (state.videoTitleOverride) overlayLines.push(state.videoTitleOverride);
  if (segmentName) overlayLines.push(segmentName);
  if (extraText) overlayLines.push(extraText);
  const fullOverlayText = overlayLines.join("\n");

  // Show modal immediately with loading state
  DOM.previewModal.classList.remove("hidden");
  DOM.previewSegmentName.textContent = segmentName;
  DOM.previewSegmentDuration.textContent = `Duration: ${formatTime(duration)}`;
  DOM.previewVideo.src = "";
  DOM.previewLoading.classList.remove("hidden");
  DOM.previewCacheStatus.className = "cache-badge";
  state.previewSegmentIndex = index;

  // Update loading text helper
  const updateLoadingText = (text) => {
    const loadingEl = DOM.previewLoading.querySelector("p");
    if (loadingEl) loadingEl.textContent = text;
  };

  try {
    // Use the fallback-enabled processing
    const result = await processSegmentWithFallback(
      videoId,
      start,
      end,
      index + 1,
      fullOverlayText,
      (progress) => {
        updateLoadingText(progress.stage);
      }
    );

    if (result.success) {
      DOM.previewLoading.classList.add("hidden");

      // Handle client-processed vs server-processed results
      if (result.clientProcessed && result.blobUrl) {
        // Client-side processed - use blob URL
        DOM.previewVideo.src = result.blobUrl;
        DOM.previewCacheStatus.className = "cache-badge fresh";
        DOM.previewCacheStatus.textContent = "Local";
        showToast(
          "success",
          "Preview ready",
          "Processed locally on your device ⚡"
        );

        // Store the blob for potential upload
        state.lastProcessedBlob = result.blob;
        state.lastProcessedFilename = result.filename;
      } else {
        // Server-side processed - use server path
        DOM.previewVideo.src = `/output/${result.filename}`;

        // Show cache status from server
        if (result.cached) {
          DOM.previewCacheStatus.className = "cache-badge cached";
          showToast("success", "Preview ready", "Loaded from cache ⚡");
        } else {
          DOM.previewCacheStatus.className = "cache-badge fresh";
          showToast("success", "Preview ready", "Segment processed & cached");
        }

        state.lastProcessedBlob = null;
        state.lastProcessedFilename = result.filename;
      }
    }
  } catch (e) {
    DOM.previewLoading.classList.add("hidden");
    showToast("error", "Preview failed", e.message);
    closePreview();
  }
}

function closePreview() {
  DOM.previewModal.classList.add("hidden");
  DOM.previewVideo.pause();
  DOM.previewVideo.src = "";
  state.previewSegmentIndex = null;
}

// Upload from preview modal
function uploadFromPreview() {
  if (state.previewSegmentIndex !== null) {
    closePreview();
    uploadSegment(state.previewSegmentIndex);
  }
}

// ============ Save & Mark Finished ============
function saveSeams() {
  if (!state.selectedVideo) return;

  const success = StorageManager.saveSeams(
    state.selectedVideo.id,
    state.seams,
    state.segmentNames,
    state.textOverlays,
    state.videoTitleOverride
  );

  if (success) {
    showToast("success", "Saved", "Seams saved successfully");
  } else {
    showToast("error", "Save failed", "Could not save seams");
  }
}

function toggleMarkFinished() {
  if (!state.selectedVideo) return;

  const isNowFinished = StorageManager.toggleVideoFinished(
    state.selectedVideo.id
  );

  if (isNowFinished) {
    showToast("success", "Marked as finished");
  } else {
    showToast("info", "Marked as pending");
  }

  renderVideoList();
  updateMarkFinishedButton();
}

function updateMarkFinishedButton() {
  if (!state.selectedVideo) return;

  const isFinished = StorageManager.isVideoFinished(state.selectedVideo.id);

  if (isFinished) {
    DOM.markFinishedBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      Undo
    `;
    DOM.markFinishedBtn.classList.remove("btn-success");
    DOM.markFinishedBtn.style.background = "var(--warning)";
  } else {
    DOM.markFinishedBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Done
    `;
    DOM.markFinishedBtn.classList.add("btn-success");
    DOM.markFinishedBtn.style.background = "";
  }
}

// ============ Ignore Video Functions ============
function toggleIgnoreVideo(videoId = null) {
  const id = videoId || state.selectedVideo?.id;
  if (!id) return;

  const isNowIgnored = StorageManager.toggleVideoIgnored(id);

  if (isNowIgnored) {
    showToast("info", "Video ignored", "Hidden from default view");
  } else {
    showToast("info", "Video restored", "Now visible in list");
  }

  renderVideoList();
  if (state.selectedVideo?.id === id) {
    updateIgnoreButton();
  }
}

function updateIgnoreButton() {
  if (!state.selectedVideo || !DOM.ignoreVideoBtn) return;

  const isIgnored = StorageManager.isVideoIgnored(state.selectedVideo.id);

  if (isIgnored) {
    DOM.ignoreVideoBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    DOM.ignoreVideoBtn.title = "Restore this video";
  } else {
    DOM.ignoreVideoBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
      </svg>
    `;
    DOM.ignoreVideoBtn.title = "Ignore this video";
  }
}

// ============ Queue Functions ============
function renderQueue() {
  state.queue = StorageManager.getQueue();
  DOM.queueCount.textContent = state.queue.length;

  // Enable/disable buttons based on queue state
  const hasPending = state.queue.some((item) => item.status === "pending");
  DOM.processQueueBtn.disabled = !hasPending || state.queueProcessing;
  DOM.clearQueueBtn.disabled = state.queue.length === 0;
  DOM.sendToServerBtn.disabled = state.queue.length === 0;

  if (state.queue.length === 0) {
    DOM.queueList.innerHTML = `
      <div class="queue-empty">
        <p>Queue is empty</p>
        <small>Add segments to start processing</small>
      </div>
    `;
    return;
  }

  DOM.queueList.innerHTML = state.queue
    .map(
      (item, index) => `
    <div class="queue-item ${item.status}" draggable="true" data-id="${
        item.id
      }" data-index="${index}">
      <div class="queue-item-header">
        <span class="queue-item-title">${
          item.uploadTitle || item.segmentName
        }</span>
        <span class="queue-item-status ${item.status}">${item.status}</span>
      </div>
      <div class="queue-item-meta">
        ${item.videoTitle} • ${item.segmentName} • ${formatTime(item.duration)}
      </div>
      <div class="queue-item-actions">
        <button class="btn btn-small local-only" onclick="previewQueueItem('${
          item.id
        }')" ${item.status !== "pending" ? "disabled" : ""}>Preview</button>
        <button class="btn btn-small" onclick="editQueueItem('${item.id}')" ${
        item.status !== "pending" ? "disabled" : ""
      }>Edit</button>
        <button class="btn btn-small" style="background: var(--error);" onclick="removeFromQueue('${
          item.id
        }')" ${
        item.status === "processing" || item.status === "uploading"
          ? "disabled"
          : ""
      }>Remove</button>
      </div>
    </div>
  `
    )
    .join("");

  // Add drag and drop handlers
  setupQueueDragDrop();
}

function setupQueueDragDrop() {
  const items = DOM.queueList.querySelectorAll(".queue-item");

  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      if (item.querySelector("[disabled]")) return;
      item.classList.add("dragging");
      e.dataTransfer.setData("text/plain", item.dataset.index);
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = DOM.queueList.querySelector(".dragging");
      if (dragging && dragging !== item) {
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          item.parentNode.insertBefore(dragging, item);
        } else {
          item.parentNode.insertBefore(dragging, item.nextSibling);
        }
      }
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
      const toIndex = parseInt(item.dataset.index);
      if (fromIndex !== toIndex) {
        StorageManager.reorderQueue(fromIndex, toIndex);
        renderQueue();
      }
    });
  });
}

function addToQueue(index) {
  if (!state.selectedVideo || state.seams.length < 2) return;

  const start = state.seams[index].time;
  const end = state.seams[index + 1].time;
  const duration = end - start;
  const segmentName = state.segmentNames[index] || `Part ${index + 1}`;
  const extraText = state.textOverlays[index] || "";

  // Construct overlay text
  const overlayLines = [];
  if (state.videoTitleOverride) overlayLines.push(state.videoTitleOverride);
  if (segmentName) overlayLines.push(segmentName);
  if (extraText) overlayLines.push(extraText);
  const fullOverlayText = overlayLines.join("\n");

  // Process upload title template
  const uploadTitle = processUploadTitle(
    DOM.uploadTitle.value || "{title} - {part} {text}",
    index
  );

  const queueItem = {
    videoId: state.selectedVideo.id,
    videoTitle: state.videoTitleOverride || state.selectedVideo.title,
    segmentIndex: index,
    segmentName: segmentName,
    startTime: start,
    endTime: end,
    duration: duration,
    overlayText: fullOverlayText,
    uploadTitle: uploadTitle,
    uploadDescription: DOM.uploadDescription.value || "",
    uploadTags: DOM.uploadTags.value || "",
    uploadPrivacy: DOM.uploadPrivacy.value || "private",
  };

  const added = StorageManager.addToQueue(queueItem);
  if (added) {
    showToast(
      "success",
      "Added to queue",
      `${segmentName} queued for processing`
    );
    renderQueue();
  } else {
    showToast("error", "Queue error", "Failed to add to queue");
  }
}

function addAllToQueue() {
  if (!state.selectedVideo || state.seams.length < 2) return;

  let addedCount = 0;
  for (let i = 0; i < state.seams.length - 1; i++) {
    const start = state.seams[i].time;
    const end = state.seams[i + 1].time;
    const duration = end - start;
    const segmentName = state.segmentNames[i] || `Part ${i + 1}`;
    const extraText = state.textOverlays[i] || "";

    const overlayLines = [];
    if (state.videoTitleOverride) overlayLines.push(state.videoTitleOverride);
    if (segmentName) overlayLines.push(segmentName);
    if (extraText) overlayLines.push(extraText);
    const fullOverlayText = overlayLines.join("\n");

    const uploadTitle = processUploadTitle(
      DOM.uploadTitle.value || "{title} - {part} {text}",
      i
    );

    const queueItem = {
      videoId: state.selectedVideo.id,
      videoTitle: state.videoTitleOverride || state.selectedVideo.title,
      segmentIndex: i,
      segmentName: segmentName,
      startTime: start,
      endTime: end,
      duration: duration,
      overlayText: fullOverlayText,
      uploadTitle: uploadTitle,
      uploadDescription: DOM.uploadDescription.value || "",
      uploadTags: DOM.uploadTags.value || "",
      uploadPrivacy: DOM.uploadPrivacy.value || "private",
    };

    if (StorageManager.addToQueue(queueItem)) {
      addedCount++;
    }
  }

  if (addedCount > 0) {
    showToast("success", "Added to queue", `${addedCount} segment(s) queued`);
    renderQueue();
  }
}

function removeFromQueue(itemId) {
  if (StorageManager.removeFromQueue(itemId)) {
    renderQueue();
    showToast("info", "Removed", "Item removed from queue");
  }
}

function editQueueItem(itemId) {
  const queue = StorageManager.getQueue();
  const item = queue.find((q) => q.id === itemId);
  if (!item) return;

  // Populate modal with item data
  DOM.queueEditId.value = itemId;
  DOM.queueEditTitle.value = item.uploadTitle || "";
  DOM.queueEditSegmentName.value = item.segmentName || "";
  DOM.queueEditPrivacy.value = item.uploadPrivacy || "private";
  DOM.queueEditDescription.value = item.uploadDescription || "";
  DOM.queueEditTags.value = item.uploadTags || "";
  DOM.queueEditOverlay.value = item.overlayText || "";
  DOM.queueEditStart.value = formatTime(item.startTime);
  DOM.queueEditEnd.value = formatTime(item.endTime);
  DOM.queueEditDuration.value = formatTime(item.duration);

  // Show modal
  DOM.queueEditModal.classList.remove("hidden");
}

function closeQueueEditModal() {
  DOM.queueEditModal.classList.add("hidden");
}

function saveQueueItemEdit() {
  const itemId = DOM.queueEditId.value;
  if (!itemId) return;

  const updates = {
    uploadTitle: DOM.queueEditTitle.value,
    segmentName: DOM.queueEditSegmentName.value,
    uploadPrivacy: DOM.queueEditPrivacy.value,
    uploadDescription: DOM.queueEditDescription.value,
    uploadTags: DOM.queueEditTags.value,
    overlayText: DOM.queueEditOverlay.value,
  };

  if (StorageManager.updateQueueItem(itemId, updates)) {
    showToast("success", "Saved", "Queue item updated");
    renderQueue();
    closeQueueEditModal();
  } else {
    showToast("error", "Error", "Failed to update queue item");
  }
}

function clearQueue() {
  if (confirm("Clear all items from the queue?")) {
    StorageManager.saveQueue([]);
    renderQueue();
    showToast("info", "Queue cleared", "All items removed from queue");
  }
}

// ============ Server Queue Functions ============

async function sendQueueToServer() {
  if (!state.authenticated) {
    showToast("warning", "Sign in required", "Please sign in to YouTube first");
    handleAuth();
    return;
  }

  const localQueue = StorageManager.getQueue();
  if (localQueue.length === 0) {
    showToast("warning", "Queue empty", "Add items to queue first");
    return;
  }

  try {
    DOM.sendToServerBtn.disabled = true;
    DOM.sendToServerBtn.textContent = "Syncing...";

    // Get existing server queue to merge
    let serverQueue = [];
    try {
      const serverData = await API.getServerQueue();
      serverQueue = serverData.queue || [];
    } catch (e) {
      // No existing queue, that's fine
    }

    // Helper to check if two queue items are the same
    const itemsMatch = (a, b) => {
      return (
        a.videoId === b.videoId &&
        a.startTime === b.startTime &&
        a.endTime === b.endTime &&
        a.segmentIndex === b.segmentIndex &&
        a.uploadTitle === b.uploadTitle &&
        a.textOverlay === b.textOverlay
      );
    };

    // Merge: add items from local that don't exist on server
    let added = 0;
    for (const localItem of localQueue) {
      const exists = serverQueue.some((serverItem) =>
        itemsMatch(localItem, serverItem)
      );
      if (!exists) {
        serverQueue.push(localItem);
        added++;
      }
    }

    // Save merged queue
    await API.saveServerQueue(serverQueue);

    if (added > 0) {
      showToast(
        "success",
        "Queue synced",
        `${added} new items added to server (${serverQueue.length} total)`
      );
    } else {
      showToast("info", "Already synced", "All items already on server");
    }
    updateServerQueueBadge();
  } catch (err) {
    showToast("error", "Failed to sync", err.message);
  } finally {
    DOM.sendToServerBtn.disabled = false;
    DOM.sendToServerBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M22 2L11 13"></path>
        <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
      </svg>
      Sync to Server
    `;
  }
}

async function updateServerQueueBadge() {
  try {
    const { queue } = await API.getServerQueue();
    state.serverQueue = queue || [];
    state.serverQueueLoaded = true;

    if (DOM.serverQueueBadge) {
      DOM.serverQueueBadge.textContent = queue.length > 0 ? queue.length : "";
    }
  } catch (err) {
    // Not authenticated or error - ignore
    state.serverQueue = [];
  }
}

async function openServerQueueModal() {
  if (!state.authenticated) {
    showToast("warning", "Sign in required", "Please sign in to YouTube first");
    handleAuth();
    return;
  }

  DOM.serverQueueModal.classList.remove("hidden");
  await loadServerQueue();
}

function closeServerQueueModal() {
  DOM.serverQueueModal.classList.add("hidden");
}

async function loadServerQueue() {
  DOM.serverQueueStatus.textContent = "Loading...";
  DOM.serverQueueList.innerHTML =
    '<div class="queue-empty"><p>Loading...</p></div>';

  try {
    const { queue, updatedAt } = await API.getServerQueue();
    state.serverQueue = queue || [];

    if (updatedAt) {
      const date = new Date(updatedAt).toLocaleString();
      DOM.serverQueueStatus.textContent = `${queue.length} items • Last updated: ${date}`;
    } else {
      DOM.serverQueueStatus.textContent = `${queue.length} items`;
    }

    renderServerQueue();
    updateServerQueueBadge();
  } catch (err) {
    DOM.serverQueueStatus.textContent = "Error loading queue";
    DOM.serverQueueList.innerHTML = `<div class="queue-empty"><p>Error: ${err.message}</p></div>`;
  }
}

function renderServerQueue() {
  if (state.serverQueue.length === 0) {
    DOM.serverQueueList.innerHTML =
      '<div class="queue-empty"><p>No items in server queue</p></div>';
    return;
  }

  DOM.serverQueueList.innerHTML = state.serverQueue
    .map(
      (item) => `
      <div class="server-queue-item" data-id="${item.id}">
        <div class="server-queue-item-thumb">
          <img src="https://img.youtube.com/vi/${
            item.videoId
          }/mqdefault.jpg" alt="">
        </div>
        <div class="server-queue-item-info">
          <div class="server-queue-item-title">${
            item.uploadTitle || item.segmentName || "Untitled"
          }</div>
          <div class="server-queue-item-meta">
            ${item.segmentName || `Segment ${item.segmentIndex + 1}`} • 
            ${formatTime(item.startTime)} - ${formatTime(item.endTime)}
            ${
              item.status !== "pending"
                ? ` • <strong>${item.status}</strong>`
                : ""
            }
          </div>
        </div>
        <div class="server-queue-item-actions">
          <button class="btn-icon" title="Preview" onclick="previewServerQueueItem('${
            item.id
          }')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
          <button class="btn-icon" title="Delete" onclick="deleteServerQueueItem('${
            item.id
          }')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

async function deleteServerQueueItem(itemId) {
  if (!confirm("Delete this item from server queue?")) return;

  try {
    await API.deleteServerQueueItem(itemId);
    await loadServerQueue();
    showToast("success", "Item deleted", "Removed from server queue");
  } catch (err) {
    showToast("error", "Delete failed", err.message);
  }
}

async function clearServerQueue() {
  if (!confirm("Clear all items from server queue?")) return;

  try {
    await API.clearServerQueue();
    await loadServerQueue();
    showToast("success", "Server queue cleared", "All items removed");
  } catch (err) {
    showToast("error", "Clear failed", err.message);
  }
}

async function importServerQueueToLocal() {
  if (state.serverQueue.length === 0) {
    showToast("warning", "Nothing to import", "Server queue is empty");
    return;
  }

  const localQueue = StorageManager.getQueue();
  const existingIds = new Set(localQueue.map((item) => item.id));

  // Add items that don't already exist locally
  let added = 0;
  for (const item of state.serverQueue) {
    if (!existingIds.has(item.id)) {
      localQueue.push({ ...item, status: "pending" });
      added++;
    }
  }

  StorageManager.saveQueue(localQueue);
  renderQueue();

  if (added > 0) {
    showToast("success", "Imported", `${added} items added to local queue`);
  } else {
    showToast("info", "No new items", "All items already in local queue");
  }
}

async function processServerQueue() {
  // Import to local first, then process
  await importServerQueueToLocal();
  closeServerQueueModal();
  processQueue();
}

async function previewServerQueueItem(itemId) {
  const item = state.serverQueue.find((i) => i.id === itemId);
  if (!item) return;

  closeServerQueueModal();
  await previewQueueItemData(item);
}

async function previewQueueItem(itemId) {
  const queue = StorageManager.getQueue();
  const item = queue.find((i) => i.id === itemId);
  if (!item) return;

  await previewQueueItemData(item);
}

async function previewQueueItemData(item) {
  state.previewSegmentIndex = null; // Clear since this is from queue

  // Set up preview with item data
  DOM.previewSegmentName.textContent =
    item.uploadTitle || item.segmentName || "Queue Item";
  DOM.previewSegmentDuration.textContent = `Duration: ${formatTime(
    item.endTime - item.startTime
  )}`;
  DOM.previewModal.classList.remove("hidden");
  DOM.previewLoading.classList.remove("hidden");
  DOM.previewVideo.classList.add("hidden");

  try {
    const result = await processSegmentWithFallback(
      item.videoId,
      item.startTime,
      item.endTime,
      0,
      item.textOverlay || ""
    );

    if (result.segmentPath) {
      DOM.previewVideo.src = `${API.baseUrl}${result.segmentPath}`;
    } else if (result.blob) {
      DOM.previewVideo.src = URL.createObjectURL(result.blob);
    }

    DOM.previewLoading.classList.add("hidden");
    DOM.previewVideo.classList.remove("hidden");
  } catch (err) {
    showToast("error", "Preview failed", err.message);
    DOM.previewModal.classList.add("hidden");
  }
}

// Remove item from both local and server queue after processing
async function removeProcessedItem(itemId) {
  // Remove from local
  const queue = StorageManager.getQueue();
  const filtered = queue.filter((item) => item.id !== itemId);
  StorageManager.saveQueue(filtered);
  renderQueue();

  // Also remove from server if it exists there
  try {
    await API.deleteServerQueueItem(itemId);
    updateServerQueueBadge();
  } catch (err) {
    // Ignore errors - item might not exist on server
  }
}

async function processQueue() {
  const queue = StorageManager.getQueue();
  const pendingItems = queue.filter((item) => item.status === "pending");

  if (pendingItems.length === 0) {
    showToast("info", "Nothing to process", "No pending items in queue");
    return;
  }

  state.queueProcessing = true;
  DOM.processQueueBtn.disabled = true;
  showToast(
    "info",
    "Processing",
    `Starting to process ${pendingItems.length} item(s)...`
  );

  // First, ensure all unique videos are downloaded (with fallback)
  const uniqueVideoIds = [...new Set(pendingItems.map((item) => item.videoId))];
  for (const videoId of uniqueVideoIds) {
    try {
      await ensureVideoDownloaded(videoId, (progress) => {
        console.log(`[${videoId}] ${progress.stage}`);
      });
    } catch (e) {
      console.error(`Failed to download video ${videoId}:`, e.message);
      // Mark all items for this video as error
      pendingItems
        .filter((item) => item.videoId === videoId)
        .forEach((item) => {
          StorageManager.updateQueueItem(item.id, {
            status: "error",
            error: `Download failed: ${e.message}`,
          });
        });
    }
  }
  renderQueue();

  // Process all items in parallel (rendering) - videos should now be cached
  const remainingItems = pendingItems.filter((item) => {
    const current = StorageManager.getQueue().find((q) => q.id === item.id);
    return current && current.status === "pending";
  });

  const processPromises = remainingItems.map(async (item) => {
    try {
      StorageManager.updateQueueItem(item.id, { status: "processing" });
      renderQueue();

      const result = await API.processSegment(
        item.videoId,
        item.startTime,
        item.endTime,
        item.segmentIndex + 1,
        item.overlayText
      );

      if (result.success) {
        StorageManager.updateQueueItem(item.id, {
          status: "rendered",
          outputPath: `output/${result.filename}`,
          cached: result.cached,
        });
        return { success: true, item, result };
      } else {
        throw new Error("Processing failed");
      }
    } catch (error) {
      StorageManager.updateQueueItem(item.id, {
        status: "error",
        error: error.message,
      });
      renderQueue();
      return { success: false, item, error };
    }
  });

  const processResults = await Promise.all(processPromises);
  renderQueue();

  // Upload in order (sequential)
  const successfulItems = processResults.filter((r) => r.success);

  for (const { item } of successfulItems) {
    const currentItem = StorageManager.getQueue().find((q) => q.id === item.id);
    if (!currentItem || currentItem.status === "error") continue;

    try {
      StorageManager.updateQueueItem(item.id, { status: "uploading" });
      renderQueue();

      const uploadResult = await API.uploadSegment(
        currentItem.outputPath,
        currentItem.uploadTitle,
        currentItem.uploadDescription,
        currentItem.uploadTags,
        currentItem.uploadPrivacy
      );

      if (uploadResult.success) {
        StorageManager.updateQueueItem(item.id, {
          status: "completed",
          youtubeUrl: uploadResult.url,
          youtubeId: uploadResult.videoId,
        });
        showToast(
          "success",
          "Uploaded",
          `"${currentItem.uploadTitle}" uploaded!`
        );
      } else {
        throw new Error(uploadResult.error || "Upload failed");
      }
    } catch (error) {
      StorageManager.updateQueueItem(item.id, {
        status: "error",
        error: error.message,
      });
      showToast(
        "error",
        "Upload failed",
        `${currentItem.uploadTitle}: ${error.message}`
      );
    }
    renderQueue();
  }

  // Remove completed items after a delay (both local and server)
  setTimeout(async () => {
    const completedItems = StorageManager.getQueue().filter(
      (q) => q.status === "completed"
    );

    // Remove from server queue too
    for (const item of completedItems) {
      try {
        await API.deleteServerQueueItem(item.id);
      } catch (e) {
        // Ignore - item might not exist on server
      }
    }

    StorageManager.clearCompletedFromQueue();
    renderQueue();
    updateServerQueueBadge();
  }, 3000);

  state.queueProcessing = false;
  DOM.processQueueBtn.disabled = false;
  renderQueue();

  const completedCount = StorageManager.getQueue().filter(
    (q) => q.status === "completed"
  ).length;
  const errorCount = StorageManager.getQueue().filter(
    (q) => q.status === "error"
  ).length;

  if (errorCount > 0) {
    showToast(
      "warning",
      "Processing complete",
      `${completedCount} uploaded, ${errorCount} failed`
    );
  } else {
    showToast(
      "success",
      "All done!",
      `${completedCount} video(s) uploaded successfully`
    );
  }
}

// ============ Upload Functions ============
function processUploadTitle(template, index) {
  const segmentName = state.segmentNames[index] || `Part ${index + 1}`;
  const extraText = state.textOverlays[index] || "";
  const videoTitle =
    state.videoTitleOverride || state.selectedVideo?.title || "";

  return template
    .replace(/\{title\}/gi, videoTitle)
    .replace(/\{part\}/gi, segmentName)
    .replace(/\{text\}/gi, extraText)
    .replace(/\{n\}/gi, String(index + 1));
}

async function uploadSegment(index) {
  if (!state.authenticated) {
    showToast(
      "warning",
      "Not authenticated",
      "Please sign in to YouTube first"
    );
    return;
  }

  const titleTemplate = DOM.uploadTitle.value || "{title} - {part} {text}";
  const title = processUploadTitle(titleTemplate, index);
  const description = DOM.uploadDescription.value || "";
  const tags = DOM.uploadTags.value || "";
  const privacy = DOM.uploadPrivacy.value || "private";

  // Get the cached segment path
  const start = state.seams[index].time;
  const end = state.seams[index + 1].time;
  const segmentName = state.segmentNames[index] || `Part ${index + 1}`;
  const extraText = state.textOverlays[index] || "";

  // Construct overlay text same as preview
  const overlayLines = [];
  if (state.videoTitleOverride) overlayLines.push(state.videoTitleOverride);
  if (segmentName) overlayLines.push(segmentName);
  if (extraText) overlayLines.push(extraText);
  const fullOverlayText = overlayLines.join("\n");

  try {
    // First ensure the segment is processed (with download fallback)
    showToast("info", "Processing", "Preparing segment for upload...");
    const processResult = await processSegmentWithFallback(
      state.selectedVideo.id,
      start,
      end,
      index + 1,
      fullOverlayText,
      (progress) => {
        showToast("info", "Processing", progress.stage);
      }
    );

    if (!processResult.success) {
      throw new Error("Failed to process segment");
    }

    // Upload to YouTube
    showToast("info", "Uploading", `Uploading "${title}"...`);
    const uploadResult = await API.uploadSegment(
      `output/${processResult.filename}`,
      title,
      description,
      tags,
      privacy
    );

    if (uploadResult.success) {
      showToast("success", "Uploaded!", `"${title}" uploaded to YouTube`);
    } else {
      throw new Error(uploadResult.error || "Upload failed");
    }
  } catch (error) {
    showToast("error", "Upload failed", error.message);
  }
}

// ============ Filter Functions ============
function setFilter(filter) {
  state.currentFilter = filter;

  DOM.filterTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filter === filter);
  });

  renderVideoList();
}

// ============ Video Search ============
function handleVideoSearch() {
  state.videoSearchQuery = DOM.videoSearch.value.trim();
  renderVideoList();
}

// ============ Initialize ============
async function init() {
  // Check environment (production vs development)
  try {
    const env = await API.getEnvironment();
    state.isProduction = env.isProduction;

    if (state.isProduction) {
      document.body.classList.add("production-mode");
      console.log("🏭 Running in PRODUCTION mode - local processing disabled");

      // Add production badge to header
      const header = document.querySelector(".header-brand h1");
      if (header) {
        header.innerHTML += '<span class="production-badge">SERVER</span>';
      }
    } else {
      console.log("🔧 Running in DEVELOPMENT mode - full features enabled");
    }
  } catch (err) {
    console.warn("Could not check environment:", err.message);
  }

  // Check for auth callback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth") === "success") {
    showToast("success", "Connected!", "Successfully connected to YouTube");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (urlParams.get("auth") === "error") {
    showToast("error", "Auth failed", "Could not connect to YouTube");
    window.history.replaceState({}, "", window.location.pathname);
  }

  // Check auth status
  await checkAuthStatus();

  // Load server queue badge (if authenticated)
  if (state.authenticated) {
    updateServerQueueBadge();
  }

  // Load saved channel
  const savedChannel = StorageManager.getSelectedChannel();
  if (savedChannel) {
    state.selectedChannel = savedChannel;
    DOM.channelResults.classList.add("hidden");
    DOM.selectedChannel.classList.remove("hidden");
    DOM.selectedChannel.innerHTML = `
      <img src="${savedChannel.thumbnail}" alt="${savedChannel.title}">
      <div class="selected-channel-info">
        <h4>${savedChannel.title}</h4>
        <p>Selected channel</p>
      </div>
      <button class="clear-btn" onclick="clearChannel()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    await loadChannelVideos();
  }

  // Load upload settings
  state.uploadSettings = StorageManager.getUploadSettings();
  DOM.uploadTitle.value = state.uploadSettings.titleTemplate;
  DOM.uploadDescription.value = state.uploadSettings.description;
  DOM.uploadTags.value = state.uploadSettings.tags;
  DOM.uploadPrivacy.value = state.uploadSettings.privacy;

  // Load queue
  state.queue = StorageManager.getQueue();
  renderQueue();

  // Event listeners
  DOM.authBtn.addEventListener("click", handleAuth);
  DOM.uploadAuthBtn.addEventListener("click", handleAuth);
  DOM.searchBtn.addEventListener("click", searchChannels);
  DOM.channelSearch.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchChannels();
  });

  // Video search
  DOM.videoSearch.addEventListener("input", debounce(handleVideoSearch, 300));

  DOM.filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => setFilter(tab.dataset.filter));
  });

  DOM.prevPage.addEventListener("click", () =>
    loadChannelVideos(state.pagination.prevToken)
  );
  DOM.nextPage.addEventListener("click", () =>
    loadChannelVideos(state.pagination.nextToken)
  );

  DOM.playPause.addEventListener("click", togglePlayPause);
  DOM.seekBack.addEventListener("click", () => seekRelative(-10));
  DOM.seekForward.addEventListener("click", () => seekRelative(10));
  DOM.addSeamBtn.addEventListener("click", addSeam);

  DOM.timeline.addEventListener("click", handleTimelineClick);

  DOM.saveSeamsBtn.addEventListener("click", saveSeams);
  DOM.markFinishedBtn.addEventListener("click", toggleMarkFinished);
  DOM.ignoreVideoBtn.addEventListener("click", () => toggleIgnoreVideo());

  // Video title override input - track previous value to detect changes
  let previousTitle = "";
  DOM.videoTitleOverride.addEventListener("focus", () => {
    previousTitle = state.videoTitleOverride;
  });
  DOM.videoTitleOverride.addEventListener("input", (e) => {
    state.videoTitleOverride = e.target.value;
  });
  DOM.videoTitleOverride.addEventListener("blur", async () => {
    // Clear cache if title changed (affects all segment overlays)
    if (state.selectedVideo && state.videoTitleOverride !== previousTitle) {
      try {
        const result = await API.clearCache(state.selectedVideo.id);
        if (result.deletedCount > 0) {
          showToast(
            "info",
            "Cache cleared",
            `${result.deletedCount} cached segments invalidated`
          );
        }
      } catch (e) {
        console.error("Failed to clear cache:", e);
      }
    }
  });

  // Upload settings auto-save
  const saveUploadSettings = () => {
    state.uploadSettings = {
      titleTemplate: DOM.uploadTitle.value,
      description: DOM.uploadDescription.value,
      tags: DOM.uploadTags.value,
      privacy: DOM.uploadPrivacy.value,
    };
    StorageManager.saveUploadSettings(state.uploadSettings);
  };
  DOM.uploadTitle.addEventListener("change", saveUploadSettings);
  DOM.uploadDescription.addEventListener("change", saveUploadSettings);
  DOM.uploadTags.addEventListener("change", saveUploadSettings);
  DOM.uploadPrivacy.addEventListener("change", saveUploadSettings);

  // Local processing toggle
  if (DOM.preferLocalProcessing) {
    // Load saved preference
    DOM.preferLocalProcessing.checked =
      localStorage.getItem("preferClientProcessing") === "true";

    DOM.preferLocalProcessing.addEventListener("change", (e) => {
      localStorage.setItem(
        "preferClientProcessing",
        e.target.checked ? "true" : "false"
      );
      if (e.target.checked) {
        showToast(
          "info",
          "Local processing enabled",
          "Video processing will use your device (FFmpeg.wasm)"
        );
        // Pre-load FFmpeg
        ClientFFmpeg.load().catch(console.error);
      } else {
        showToast(
          "info",
          "Server processing enabled",
          "Video processing will use the server"
        );
      }
    });

    // Check if FFmpeg.wasm is supported (WebAssembly required)
    if (!ClientFFmpeg.isSupported()) {
      DOM.preferLocalProcessing.disabled = true;
      DOM.preferLocalProcessing.parentElement.title =
        "FFmpeg.wasm not supported in this browser (requires WebAssembly)";
    }
  }

  // Cookies management
  const cookiesStatus = document.getElementById("cookies-status");
  const cookiesFile = document.getElementById("cookies-file");

  async function updateCookiesStatus() {
    if (!cookiesStatus) return;
    try {
      const status = await API.getCookiesStatus();
      if (status.exists) {
        const date = new Date(status.info.modified).toLocaleDateString();
        cookiesStatus.textContent = `✅ Uploaded (${date})`;
        cookiesStatus.style.color = "#2ecc71";
      } else {
        cookiesStatus.textContent = "❌ Not uploaded";
        cookiesStatus.style.color = "#e74c3c";
      }
    } catch (e) {
      cookiesStatus.textContent = "⚠️ Error checking";
      cookiesStatus.style.color = "#f39c12";
    }
  }

  if (cookiesFile) {
    cookiesFile.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const content = await file.text();
        await API.uploadCookies(content);
        showToast(
          "success",
          "Cookies uploaded",
          "YouTube authentication cookies saved"
        );
        updateCookiesStatus();
      } catch (err) {
        showToast("error", "Upload failed", err.message);
      }

      // Reset input
      e.target.value = "";
    });
  }

  // Check cookies status on load
  updateCookiesStatus();

  // Sidebar toggle
  DOM.toggleSidebarBtn.addEventListener("click", () => {
    DOM.leftSidebar.classList.toggle("collapsed");
    localStorage.setItem(
      "leftSidebarCollapsed",
      DOM.leftSidebar.classList.contains("collapsed")
    );
  });

  // Restore sidebar state
  if (localStorage.getItem("leftSidebarCollapsed") === "true") {
    DOM.leftSidebar.classList.add("collapsed");
  }
  if (localStorage.getItem("queueSidebarCollapsed") === "true") {
    DOM.queueSidebar.classList.add("collapsed");
  }

  // Queue event listeners
  DOM.addAllToQueueBtn.addEventListener("click", addAllToQueue);
  DOM.processQueueBtn.addEventListener("click", processQueue);
  DOM.clearQueueBtn.addEventListener("click", clearQueue);
  DOM.toggleQueueBtn.addEventListener("click", () => {
    DOM.queueSidebar.classList.toggle("collapsed");
    localStorage.setItem(
      "queueSidebarCollapsed",
      DOM.queueSidebar.classList.contains("collapsed")
    );
  });

  // Server queue event listeners
  DOM.sendToServerBtn.addEventListener("click", sendQueueToServer);
  DOM.viewServerQueueBtn.addEventListener("click", openServerQueueModal);
  DOM.closeServerQueueBtn.addEventListener("click", closeServerQueueModal);
  DOM.refreshServerQueueBtn.addEventListener("click", loadServerQueue);
  DOM.importServerQueueBtn.addEventListener("click", importServerQueueToLocal);
  DOM.processServerQueueBtn.addEventListener("click", processServerQueue);
  DOM.clearServerQueueBtn.addEventListener("click", clearServerQueue);
  DOM.serverQueueModal
    .querySelector(".modal-backdrop")
    .addEventListener("click", closeServerQueueModal);

  // Queue edit modal events
  DOM.closeQueueEditBtn.addEventListener("click", closeQueueEditModal);
  DOM.queueEditCancelBtn.addEventListener("click", closeQueueEditModal);
  DOM.queueEditSaveBtn.addEventListener("click", saveQueueItemEdit);
  DOM.queueEditModal
    .querySelector(".modal-backdrop")
    .addEventListener("click", closeQueueEditModal);

  // Preview modal events
  DOM.closePreviewBtn.addEventListener("click", closePreview);
  DOM.previewUploadBtn.addEventListener("click", uploadFromPreview);

  // Close modal on backdrop click
  DOM.previewModal
    .querySelector(".modal-backdrop")
    .addEventListener("click", closePreview);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Close modals on Escape
    if (e.key === "Escape") {
      if (!DOM.previewModal.classList.contains("hidden")) {
        closePreview();
        return;
      }
      if (!DOM.queueEditModal.classList.contains("hidden")) {
        closeQueueEditModal();
        return;
      }
    }

    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        togglePlayPause();
        break;
      case "ArrowLeft":
        seekRelative(-5);
        break;
      case "ArrowRight":
        seekRelative(5);
        break;
      case "s":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          saveSeams();
        }
        break;
      case "m":
        addSeam();
        break;
    }
  });
}

// Make functions available globally
window.clearChannel = clearChannel;
window.seekTo = seekTo;
window.deleteSeam = deleteSeam;
window.uploadSegment = uploadSegment;
window.previewSegment = previewSegment;
window.toggleIgnoreVideo = toggleIgnoreVideo;
window.addToQueue = addToQueue;
window.removeFromQueue = removeFromQueue;
window.editQueueItem = editQueueItem;
window.previewQueueItem = previewQueueItem;
window.deleteServerQueueItem = deleteServerQueueItem;
window.previewServerQueueItem = previewServerQueueItem;

// Start app
document.addEventListener("DOMContentLoaded", init);
