const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // File system operations
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // Video operations
  getVideoMetadata: (videoPath) => ipcRenderer.invoke('get-video-metadata', videoPath),
  
  // Data storage operations
  saveSeams: (data) => ipcRenderer.invoke('save-seams', data),
  getSeams: (videoPath) => ipcRenderer.invoke('get-seams', videoPath),
  
  // Video processing
  processVideos: (videos) => ipcRenderer.invoke('process-videos', videos)
});
