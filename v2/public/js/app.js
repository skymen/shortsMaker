/**
 * Shorts Maker v2 - Main Application
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
  currentFilter: "all",
  videoSearchQuery: "",
  pagination: {
    nextToken: null,
    prevToken: null,
    currentPage: 1,
  },
  player: null,
  playerReady: false,
  playerIntervalId: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  isDraggingSeam: false,
  draggedSeamIndex: null,
  previewSegmentIndex: null,
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
      `${this.baseUrl}/api/youtube/search-channels?query=${encodeURIComponent(query)}`
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

  async processSegment(videoId, startTime, endTime, segmentIndex) {
    const res = await fetch(`${this.baseUrl}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, startTime, endTime, segmentIndex }),
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
};

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
  saveSeamsBtn: document.getElementById("save-seams-btn"),
  markFinishedBtn: document.getElementById("mark-finished-btn"),
  ignoreVideoBtn: document.getElementById("ignore-video-btn"),

  // Preview
  previewSection: document.getElementById("preview-section"),
  previewVideo: document.getElementById("preview-video"),
  previewSegmentName: document.getElementById("preview-segment-name"),
  previewSegmentDuration: document.getElementById("preview-segment-duration"),
  closePreviewBtn: document.getElementById("close-preview-btn"),

  // Upload
  uploadAuthRequired: document.getElementById("upload-auth-required"),
  uploadControls: document.getElementById("upload-controls"),
  uploadAuthBtn: document.getElementById("upload-auth-btn"),
  uploadTitle: document.getElementById("upload-title"),
  uploadDescription: document.getElementById("upload-description"),
  uploadTags: document.getElementById("upload-tags"),
  uploadPrivacy: document.getElementById("upload-privacy"),
  segmentsUploadList: document.getElementById("segments-upload-list"),

  // Toast
  toastContainer: document.getElementById("toast-container"),
};

// ============ Utility Functions ============
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
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
    DOM.channelResults.innerHTML = '<div class="empty-state"><p>Searching...</p></div>';
    const channels = await API.searchChannels(query);
    renderChannelResults(channels);
  } catch (e) {
    showToast("error", "Search failed", e.message);
    DOM.channelResults.innerHTML = "";
  }
}

function renderChannelResults(channels) {
  if (!channels.length) {
    DOM.channelResults.innerHTML = '<div class="empty-state"><p>No channels found</p></div>';
    return;
  }

  DOM.channelResults.innerHTML = channels
    .map(
      (ch) => `
    <div class="channel-item" data-channel-id="${ch.id.channelId}">
      <img src="${ch.snippet.thumbnails.default.url}" alt="${ch.snippet.title}">
      <div class="channel-item-info">
        <h4>${ch.snippet.title}</h4>
        <p>${ch.snippet.description?.substring(0, 40) || "YouTube Channel"}...</p>
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
    const data = await API.getChannelVideos(state.selectedChannel.id, pageToken);
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
    filteredVideos = filteredVideos.filter((v) => finishedVideos.includes(v.id));
  } else if (state.currentFilter === "pending") {
    filteredVideos = filteredVideos.filter(
      (v) => !finishedVideos.includes(v.id) && !ignoredVideos.includes(v.id)
    );
  } else if (state.currentFilter === "ignored") {
    filteredVideos = filteredVideos.filter((v) => ignoredVideos.includes(v.id));
  } else {
    // "all" filter - hide ignored by default unless searching
    if (!searchQuery) {
      filteredVideos = filteredVideos.filter((v) => !ignoredVideos.includes(v.id));
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
          <button onclick="event.stopPropagation(); toggleIgnoreVideo('${video.id}')" title="${isIgnored ? 'Unignore' : 'Ignore'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${isIgnored 
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
function selectVideo(videoId) {
  const video = state.videos.find((v) => v.id === videoId);
  if (!video) return;

  state.selectedVideo = video;
  state.duration = parseDuration(video.duration);

  // Load saved seams
  const savedData = StorageManager.getSeams(videoId);
  if (savedData && savedData.seams.length) {
    state.seams = savedData.seams;
    state.segmentNames = savedData.segmentNames;
    state.textOverlays = savedData.textOverlays;
  } else {
    state.seams = [{ time: 0, label: "Start" }];
    state.segmentNames = [];
    state.textOverlays = [];
  }

  DOM.editorPlaceholder.classList.add("hidden");
  DOM.videoEditor.classList.remove("hidden");

  // Update YouTube player
  loadYouTubeVideo(videoId);

  // Update UI
  DOM.totalDuration.textContent = formatTime(state.duration);
  updateTimeline();
  renderSegmentsList();
  renderVideoList();
  updateMarkFinishedButton();
  updateIgnoreButton();
  closePreview();
}

function loadYouTubeVideo(videoId) {
  if (state.player && state.playerReady) {
    state.player.loadVideoById(videoId);
  } else {
    DOM.youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`;
  }
}

// ============ YouTube Player API ============
function onYouTubeIframeAPIReady() {
  state.player = new YT.Player("youtube-player", {
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

function onPlayerReady(event) {
  state.playerReady = true;
  if (state.playerIntervalId) {
    clearInterval(state.playerIntervalId);
  }
  state.playerIntervalId = setInterval(updateCurrentTime, 100);
}

function onPlayerStateChange(event) {
  state.isPlaying = event.data === YT.PlayerState.PLAYING;
  updatePlayPauseButton();
}

function updateCurrentTime() {
  if (state.player && state.playerReady && typeof state.player.getCurrentTime === "function") {
    state.currentTime = state.player.getCurrentTime() || 0;
    DOM.currentTime.textContent = formatTime(state.currentTime);

    if (state.duration > 0) {
      const percent = (state.currentTime / state.duration) * 100;
      DOM.timelineCursor.style.left = `${percent}%`;
      DOM.timelineProgress.style.width = `${percent}%`;
    }
  }
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
  if (!state.player || !state.playerReady) return;

  if (state.isPlaying) {
    state.player.pauseVideo();
  } else {
    state.player.playVideo();
  }
}

function seekRelative(seconds) {
  if (!state.player || !state.playerReady) return;
  const newTime = Math.max(0, Math.min(state.duration, state.currentTime + seconds));
  state.player.seekTo(newTime, true);
}

function seekTo(time) {
  if (!state.player || !state.playerReady) return;
  state.player.seekTo(time, true);
}

// ============ Timeline Functions ============
function updateTimeline() {
  DOM.timelineSeams.innerHTML = "";

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
    const marker = document.createElement("div");
    marker.className = `seam-marker ${index === 0 ? "start" : ""}`;
    marker.style.left = `${(seam.time / state.duration) * 100}%`;
    marker.dataset.index = index === 0 ? "S" : index;

    if (index > 0) {
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
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
  if (index === 0) return;

  state.seams.splice(index, 1);
  state.segmentNames.splice(index - 1, 1);
  state.textOverlays.splice(index - 1, 1);

  updateTimeline();
  renderSegmentsList();
  showToast("info", "Seam deleted");
}

// ============ Segments List Functions ============
function renderSegmentsList() {
  if (state.seams.length < 2) {
    DOM.segmentsList.innerHTML = '<div class="empty-segments"><p>Add seams to create segments</p></div>';
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
    card.className = "segment-card";
    card.innerHTML = `
      <div class="segment-card-header">
        <span class="segment-number">Segment ${i + 1}</span>
        <span class="segment-duration ${isLong ? "warning" : ""}">${formatTime(duration)}</span>
      </div>
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
             placeholder="Text overlay (optional)..."
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
        <button class="btn btn-small" onclick="deleteSeam(${i + 1})" title="Delete" style="background: var(--error);">
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
    DOM.segmentsUploadList.innerHTML = '<p style="color: var(--text-muted); text-align: center; font-size: 0.8rem;">No segments to upload</p>';
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
      <span class="upload-status pending">Ready</span>
      <button class="btn btn-small btn-primary" onclick="uploadSegment(${i})">Upload</button>
    `;

    DOM.segmentsUploadList.appendChild(item);
  }
}

// ============ Preview Functions ============
async function previewSegment(index) {
  const start = state.seams[index].time;
  const end = state.seams[index + 1].time;
  const duration = end - start;
  const name = state.segmentNames[index] || `Segment ${index + 1}`;

  showToast("info", "Processing...", "Creating preview, please wait");

  try {
    const result = await API.processSegment(
      state.selectedVideo.id,
      start,
      end,
      index + 1
    );

    if (result.outputPath) {
      DOM.previewSection.classList.remove("hidden");
      DOM.previewVideo.src = `/output/${result.outputPath.split("/").pop()}`;
      DOM.previewSegmentName.textContent = name;
      DOM.previewSegmentDuration.textContent = `Duration: ${formatTime(duration)}`;
      state.previewSegmentIndex = index;
      showToast("success", "Preview ready", "Segment processed successfully");
    }
  } catch (e) {
    showToast("error", "Preview failed", e.message);
  }
}

function closePreview() {
  DOM.previewSection.classList.add("hidden");
  DOM.previewVideo.src = "";
  state.previewSegmentIndex = null;
}

// ============ Save & Mark Finished ============
function saveSeams() {
  if (!state.selectedVideo) return;

  const success = StorageManager.saveSeams(
    state.selectedVideo.id,
    state.seams,
    state.segmentNames,
    state.textOverlays
  );

  if (success) {
    showToast("success", "Saved", "Seams saved successfully");
  } else {
    showToast("error", "Save failed", "Could not save seams");
  }
}

function toggleMarkFinished() {
  if (!state.selectedVideo) return;

  const isNowFinished = StorageManager.toggleVideoFinished(state.selectedVideo.id);

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

// ============ Upload Functions ============
async function uploadSegment(index) {
  if (!state.authenticated) {
    showToast("warning", "Not authenticated", "Please sign in to YouTube first");
    return;
  }

  showToast("info", "Upload not available", "Video processing requires server-side ffmpeg.");
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

  DOM.prevPage.addEventListener("click", () => loadChannelVideos(state.pagination.prevToken));
  DOM.nextPage.addEventListener("click", () => loadChannelVideos(state.pagination.nextToken));

  DOM.playPause.addEventListener("click", togglePlayPause);
  DOM.seekBack.addEventListener("click", () => seekRelative(-10));
  DOM.seekForward.addEventListener("click", () => seekRelative(10));
  DOM.addSeamBtn.addEventListener("click", addSeam);

  DOM.timeline.addEventListener("click", handleTimelineClick);

  DOM.saveSeamsBtn.addEventListener("click", saveSeams);
  DOM.markFinishedBtn.addEventListener("click", toggleMarkFinished);
  DOM.ignoreVideoBtn.addEventListener("click", () => toggleIgnoreVideo());
  DOM.closePreviewBtn.addEventListener("click", closePreview);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
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
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// Start app
document.addEventListener("DOMContentLoaded", init);
