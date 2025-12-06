import React, { useState } from 'react';
import VideoList from './components/VideoList';
import VideoEditor from './components/VideoEditor';
import BatchProcessor from './components/BatchProcessor';
import './App.css';

function App() {
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [processingMode, setProcessingMode] = useState(false);
  
  const selectFolder = async () => {
    const result = await window.api.selectFolder();
    if (result) {
      setSelectedFolder(result.folderPath);
      setVideos(result.files);
    }
  };
  
  const selectVideo = (video) => {
    setSelectedVideo(video);
  };
  
  const markVideoAsProcessed = (videoPath, isProcessed = true) => {
    setVideos(videos.map(video => 
      video.path === videoPath 
        ? { ...video, processed: isProcessed } 
        : video
    ));
  };
  
  const startBatchProcessing = () => {
    setProcessingMode(true);
  };
  
  const exitProcessingMode = () => {
    setProcessingMode(false);
    setSelectedVideo(null);
  };
  
  return (
    <div className="app">
      <header className="app-header">
        <h1>Video Shorts Creator</h1>
      </header>
      
      <main className="app-content">
        {!selectedFolder && (
          <div className="folder-selector">
            <h2>Select a folder with videos</h2>
            <button onClick={selectFolder}>Select Folder</button>
          </div>
        )}
        
        {selectedFolder && !processingMode && !selectedVideo && (
          <div className="videos-container">
            <h2>Videos in {selectedFolder}</h2>
            <VideoList 
              videos={videos} 
              onSelectVideo={selectVideo} 
            />
            <div className="batch-controls">
              <button 
                className="batch-button"
                onClick={startBatchProcessing}
                disabled={videos.length === 0 || videos.every(v => !v.processed)}
              >
                Start Batch Processing
              </button>
            </div>
          </div>
        )}
        
        {selectedVideo && !processingMode && (
          <VideoEditor 
            video={selectedVideo} 
            onBack={() => setSelectedVideo(null)}
            onMarkProcessed={(isProcessed) => markVideoAsProcessed(selectedVideo.path, isProcessed)}
          />
        )}
        
        {processingMode && (
          <BatchProcessor 
            videos={videos.filter(v => v.processed)} 
            onExit={exitProcessingMode}
          />
        )}
      </main>
    </div>
  );
}

export default App;
