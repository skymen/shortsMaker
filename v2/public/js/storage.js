/**
 * LocalStorage Manager for Shorts Maker v2
 * Stores seams data per YouTube video ID and tracks finished videos
 */

const StorageManager = {
  KEYS: {
    VIDEOS_DATA: 'shorts_maker_videos',
    FINISHED_VIDEOS: 'shorts_maker_finished',
    SELECTED_CHANNEL: 'shorts_maker_channel',
    SETTINGS: 'shorts_maker_settings'
  },

  /**
   * Get all stored video data
   */
  getAllVideosData() {
    try {
      const data = localStorage.getItem(this.KEYS.VIDEOS_DATA);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('Error reading videos data:', e);
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
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(this.KEYS.VIDEOS_DATA, JSON.stringify(allData));
      return true;
    } catch (e) {
      console.error('Error saving video data:', e);
      return false;
    }
  },

  /**
   * Save seams for a video
   */
  saveSeams(videoId, seams, segmentNames = [], textOverlays = []) {
    const existingData = this.getVideoData(videoId) || {};
    return this.saveVideoData(videoId, {
      ...existingData,
      seams,
      segmentNames,
      textOverlays
    });
  },

  /**
   * Get seams for a video
   */
  getSeams(videoId) {
    const data = this.getVideoData(videoId);
    return data ? {
      seams: data.seams || [],
      segmentNames: data.segmentNames || [],
      textOverlays: data.textOverlays || []
    } : null;
  },

  /**
   * Get list of finished video IDs
   */
  getFinishedVideos() {
    try {
      const data = localStorage.getItem(this.KEYS.FINISHED_VIDEOS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading finished videos:', e);
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
        localStorage.setItem(this.KEYS.FINISHED_VIDEOS, JSON.stringify(finished));
        return true;
      } catch (e) {
        console.error('Error marking video finished:', e);
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
    finished = finished.filter(id => id !== videoId);
    try {
      localStorage.setItem(this.KEYS.FINISHED_VIDEOS, JSON.stringify(finished));
      return true;
    } catch (e) {
      console.error('Error unmarking video:', e);
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

  /**
   * Save selected channel
   */
  saveSelectedChannel(channel) {
    try {
      localStorage.setItem(this.KEYS.SELECTED_CHANNEL, JSON.stringify(channel));
      return true;
    } catch (e) {
      console.error('Error saving channel:', e);
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
      console.error('Error reading channel:', e);
      return null;
    }
  },

  /**
   * Clear selected channel
   */
  clearSelectedChannel() {
    localStorage.removeItem(this.KEYS.SELECTED_CHANNEL);
  },

  /**
   * Save settings
   */
  saveSettings(settings) {
    try {
      const existing = this.getSettings();
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify({ ...existing, ...settings }));
      return true;
    } catch (e) {
      console.error('Error saving settings:', e);
      return false;
    }
  },

  /**
   * Get settings
   */
  getSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.SETTINGS);
      return data ? JSON.parse(data) : {
        defaultPrivacy: 'private',
        titleTemplate: '{title} - Part {n}',
        defaultTags: ''
      };
    } catch (e) {
      return {
        defaultPrivacy: 'private',
        titleTemplate: '{title} - Part {n}',
        defaultTags: ''
      };
    }
  },

  /**
   * Get storage statistics
   */
  getStats() {
    const videosData = this.getAllVideosData();
    const finishedVideos = this.getFinishedVideos();
    
    return {
      totalVideos: Object.keys(videosData).length,
      finishedVideos: finishedVideos.length,
      storageUsed: this.getStorageSize()
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
      channel: this.getSelectedChannel(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString()
    };
  },

  /**
   * Import data
   */
  importData(data) {
    try {
      if (data.videos) {
        localStorage.setItem(this.KEYS.VIDEOS_DATA, JSON.stringify(data.videos));
      }
      if (data.finished) {
        localStorage.setItem(this.KEYS.FINISHED_VIDEOS, JSON.stringify(data.finished));
      }
      if (data.channel) {
        localStorage.setItem(this.KEYS.SELECTED_CHANNEL, JSON.stringify(data.channel));
      }
      if (data.settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(data.settings));
      }
      return true;
    } catch (e) {
      console.error('Error importing data:', e);
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
  }
};

// Make available globally
window.StorageManager = StorageManager;

