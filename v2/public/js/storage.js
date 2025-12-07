/**
 * LocalStorage Manager for Shorts Maker v2
 * Stores seams data per YouTube video ID and tracks finished/ignored videos
 */

const StorageManager = {
  KEYS: {
    VIDEOS_DATA: "shorts_maker_videos",
    FINISHED_VIDEOS: "shorts_maker_finished",
    IGNORED_VIDEOS: "shorts_maker_ignored",
    SELECTED_CHANNEL: "shorts_maker_channel",
    SETTINGS: "shorts_maker_settings",
    UPLOAD_SETTINGS: "shorts_maker_upload_settings",
    QUEUE: "shorts_maker_queue",
  },

  /**
   * Get all stored video data
   */
  getAllVideosData() {
    try {
      const data = localStorage.getItem(this.KEYS.VIDEOS_DATA);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error("Error reading videos data:", e);
      return {};
    }
  },

  /**
   * Get seams data for a specific video by YouTube ID
   */
  getVideoData(videoId) {
    const allData = this.getAllVideosData();
    return allData[videoId] || null;
  },

  /**
   * Save seams data for a specific video
   */
  saveVideoData(videoId, data) {
    const allData = this.getAllVideosData();
    allData[videoId] = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(this.KEYS.VIDEOS_DATA, JSON.stringify(allData));
      return true;
    } catch (e) {
      console.error("Error saving video data:", e);
      return false;
    }
  },

  /**
   * Save seams for a video
   */
  saveSeams(
    videoId,
    seams,
    segmentNames = [],
    textOverlays = [],
    videoTitleOverride = ""
  ) {
    const existingData = this.getVideoData(videoId) || {};
    return this.saveVideoData(videoId, {
      ...existingData,
      seams,
      segmentNames,
      textOverlays,
      videoTitleOverride,
    });
  },

  /**
   * Get seams for a video
   */
  getSeams(videoId) {
    const data = this.getVideoData(videoId);
    return data
      ? {
          seams: data.seams || [],
          segmentNames: data.segmentNames || [],
          textOverlays: data.textOverlays || [],
          videoTitleOverride: data.videoTitleOverride || "",
        }
      : null;
  },

  // ============ FINISHED VIDEOS ============

  /**
   * Get list of finished video IDs
   */
  getFinishedVideos() {
    try {
      const data = localStorage.getItem(this.KEYS.FINISHED_VIDEOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Error reading finished videos:", e);
      return [];
    }
  },

  /**
   * Check if a video is marked as finished
   */
  isVideoFinished(videoId) {
    return this.getFinishedVideos().includes(videoId);
  },

  /**
   * Mark a video as finished
   */
  markVideoFinished(videoId) {
    const finished = this.getFinishedVideos();
    if (!finished.includes(videoId)) {
      finished.push(videoId);
      try {
        localStorage.setItem(
          this.KEYS.FINISHED_VIDEOS,
          JSON.stringify(finished)
        );
        return true;
      } catch (e) {
        console.error("Error marking video finished:", e);
        return false;
      }
    }
    return true;
  },

  /**
   * Unmark a video as finished
   */
  unmarkVideoFinished(videoId) {
    let finished = this.getFinishedVideos();
    finished = finished.filter((id) => id !== videoId);
    try {
      localStorage.setItem(this.KEYS.FINISHED_VIDEOS, JSON.stringify(finished));
      return true;
    } catch (e) {
      console.error("Error unmarking video:", e);
      return false;
    }
  },

  /**
   * Toggle video finished status
   */
  toggleVideoFinished(videoId) {
    if (this.isVideoFinished(videoId)) {
      this.unmarkVideoFinished(videoId);
      return false;
    } else {
      this.markVideoFinished(videoId);
      return true;
    }
  },

  // ============ IGNORED VIDEOS ============

  /**
   * Get list of ignored video IDs
   */
  getIgnoredVideos() {
    try {
      const data = localStorage.getItem(this.KEYS.IGNORED_VIDEOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Error reading ignored videos:", e);
      return [];
    }
  },

  /**
   * Check if a video is marked as ignored
   */
  isVideoIgnored(videoId) {
    return this.getIgnoredVideos().includes(videoId);
  },

  /**
   * Mark a video as ignored
   */
  markVideoIgnored(videoId) {
    const ignored = this.getIgnoredVideos();
    if (!ignored.includes(videoId)) {
      ignored.push(videoId);
      try {
        localStorage.setItem(this.KEYS.IGNORED_VIDEOS, JSON.stringify(ignored));
        return true;
      } catch (e) {
        console.error("Error marking video ignored:", e);
        return false;
      }
    }
    return true;
  },

  /**
   * Unmark a video as ignored
   */
  unmarkVideoIgnored(videoId) {
    let ignored = this.getIgnoredVideos();
    ignored = ignored.filter((id) => id !== videoId);
    try {
      localStorage.setItem(this.KEYS.IGNORED_VIDEOS, JSON.stringify(ignored));
      return true;
    } catch (e) {
      console.error("Error unmarking video ignored:", e);
      return false;
    }
  },

  /**
   * Toggle video ignored status
   */
  toggleVideoIgnored(videoId) {
    if (this.isVideoIgnored(videoId)) {
      this.unmarkVideoIgnored(videoId);
      return false;
    } else {
      this.markVideoIgnored(videoId);
      return true;
    }
  },

  // ============ CHANNEL ============

  /**
   * Save selected channel
   */
  saveSelectedChannel(channel) {
    try {
      localStorage.setItem(this.KEYS.SELECTED_CHANNEL, JSON.stringify(channel));
      return true;
    } catch (e) {
      console.error("Error saving channel:", e);
      return false;
    }
  },

  /**
   * Get selected channel
   */
  getSelectedChannel() {
    try {
      const data = localStorage.getItem(this.KEYS.SELECTED_CHANNEL);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("Error reading channel:", e);
      return null;
    }
  },

  /**
   * Clear selected channel
   */
  clearSelectedChannel() {
    localStorage.removeItem(this.KEYS.SELECTED_CHANNEL);
  },

  // ============ SETTINGS ============

  /**
   * Save settings
   */
  saveSettings(settings) {
    try {
      const existing = this.getSettings();
      localStorage.setItem(
        this.KEYS.SETTINGS,
        JSON.stringify({ ...existing, ...settings })
      );
      return true;
    } catch (e) {
      console.error("Error saving settings:", e);
      return false;
    }
  },

  /**
   * Get settings
   */
  getSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.SETTINGS);
      return data
        ? JSON.parse(data)
        : {
            defaultPrivacy: "private",
            titleTemplate: "{title} - Part {n}",
            defaultTags: "",
          };
    } catch (e) {
      return {
        defaultPrivacy: "private",
        titleTemplate: "{title} - Part {n}",
        defaultTags: "",
      };
    }
  },

  // ============ UPLOAD SETTINGS ============

  /**
   * Get upload settings
   */
  getUploadSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.UPLOAD_SETTINGS);
      return data
        ? JSON.parse(data)
        : {
            titleTemplate: "{title} - {part}",
            description: "",
            tags: "",
            privacy: "private",
          };
    } catch (e) {
      console.error("Error reading upload settings:", e);
      return {
        titleTemplate: "{title} - {part}",
        description: "",
        tags: "",
        privacy: "private",
      };
    }
  },

  /**
   * Save upload settings
   */
  saveUploadSettings(settings) {
    try {
      localStorage.setItem(this.KEYS.UPLOAD_SETTINGS, JSON.stringify(settings));
      return true;
    } catch (e) {
      console.error("Error saving upload settings:", e);
      return false;
    }
  },

  // ============ QUEUE ============

  /**
   * Get the upload queue
   */
  getQueue() {
    try {
      const data = localStorage.getItem(this.KEYS.QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Error reading queue:", e);
      return [];
    }
  },

  /**
   * Save the upload queue
   */
  saveQueue(queue) {
    try {
      localStorage.setItem(this.KEYS.QUEUE, JSON.stringify(queue));
      return true;
    } catch (e) {
      console.error("Error saving queue:", e);
      return false;
    }
  },

  /**
   * Add item to queue
   */
  addToQueue(item) {
    const queue = this.getQueue();
    item.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    item.addedAt = new Date().toISOString();
    item.status = "pending"; // pending, processing, uploading, completed, error
    queue.push(item);
    return this.saveQueue(queue) ? item : null;
  },

  /**
   * Update queue item
   */
  updateQueueItem(itemId, updates) {
    const queue = this.getQueue();
    const index = queue.findIndex((item) => item.id === itemId);
    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      return this.saveQueue(queue);
    }
    return false;
  },

  /**
   * Remove item from queue
   */
  removeFromQueue(itemId) {
    let queue = this.getQueue();
    queue = queue.filter((item) => item.id !== itemId);
    return this.saveQueue(queue);
  },

  /**
   * Reorder queue items
   */
  reorderQueue(fromIndex, toIndex) {
    const queue = this.getQueue();
    const [item] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, item);
    return this.saveQueue(queue);
  },

  /**
   * Clear completed items from queue
   */
  clearCompletedFromQueue() {
    let queue = this.getQueue();
    queue = queue.filter((item) => item.status !== "completed");
    return this.saveQueue(queue);
  },

  // ============ UTILITIES ============

  /**
   * Get storage statistics
   */
  getStats() {
    const videosData = this.getAllVideosData();
    const finishedVideos = this.getFinishedVideos();
    const ignoredVideos = this.getIgnoredVideos();

    return {
      totalVideos: Object.keys(videosData).length,
      finishedVideos: finishedVideos.length,
      ignoredVideos: ignoredVideos.length,
      storageUsed: this.getStorageSize(),
    };
  },

  /**
   * Calculate storage size used
   */
  getStorageSize() {
    let total = 0;
    for (const key of Object.values(this.KEYS)) {
      const item = localStorage.getItem(key);
      if (item) {
        total += item.length * 2; // UTF-16 = 2 bytes per char
      }
    }
    return total;
  },

  /**
   * Export all data
   */
  exportData() {
    return {
      videos: this.getAllVideosData(),
      finished: this.getFinishedVideos(),
      ignored: this.getIgnoredVideos(),
      channel: this.getSelectedChannel(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
    };
  },

  /**
   * Import data
   */
  importData(data) {
    try {
      if (data.videos) {
        localStorage.setItem(
          this.KEYS.VIDEOS_DATA,
          JSON.stringify(data.videos)
        );
      }
      if (data.finished) {
        localStorage.setItem(
          this.KEYS.FINISHED_VIDEOS,
          JSON.stringify(data.finished)
        );
      }
      if (data.ignored) {
        localStorage.setItem(
          this.KEYS.IGNORED_VIDEOS,
          JSON.stringify(data.ignored)
        );
      }
      if (data.channel) {
        localStorage.setItem(
          this.KEYS.SELECTED_CHANNEL,
          JSON.stringify(data.channel)
        );
      }
      if (data.settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(data.settings));
      }
      return true;
    } catch (e) {
      console.error("Error importing data:", e);
      return false;
    }
  },

  /**
   * Clear all data
   */
  clearAll() {
    for (const key of Object.values(this.KEYS)) {
      localStorage.removeItem(key);
    }
  },
};

// Make available globally
window.StorageManager = StorageManager;
