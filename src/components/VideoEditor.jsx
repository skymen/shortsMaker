import React, { useState, useEffect, useRef } from "react";
import ReactPlayer from "react-player/file";
import {
  FaPlus,
  FaArrowLeft,
  FaSave,
  FaRegClock,
  FaTrash,
  FaExclamationTriangle,
  FaClock,
} from "react-icons/fa";
// Force-load react-icons
import "@react-icons/all-files/fa/FaPlus";
import "@react-icons/all-files/fa/FaArrowLeft";
import "@react-icons/all-files/fa/FaSave";
import "@react-icons/all-files/fa/FaRegClock";
import "@react-icons/all-files/fa/FaTrash";
import "@react-icons/all-files/fa/FaExclamationTriangle";
import "@react-icons/all-files/fa/FaClock";
import "./VideoEditor.css";

const VideoEditor = ({ video, onBack, onMarkProcessed }) => {
  const [seams, setSeams] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const playerRef = useRef(null);

  // Default part labels
  const defaultPartLabels = [
    "Partie 1",
    "Partie 2",
    "Partie 3",
    "Partie 4",
    "Partie 5",
    "Partie 6",
    "Partie 7",
    "Partie 8",
  ];
  const defaultPartTextOverlay = [
    "Cours",
    "Écriture",
    "Vocabulaire",
    "Exercice",
  ];

  // State for custom segment names and text overlays
  const [segmentNames, setSegmentNames] = useState(defaultPartLabels);
  const [textOverlays, setTextOverlays] = useState(defaultPartTextOverlay);
  const [showOverlaySettings, setShowOverlaySettings] = useState(false);

  // Load seams and metadata on mount
  useEffect(() => {
    const loadSeams = async () => {
      try {
        // Get video metadata (duration)
        const metadata = await window.api.getVideoMetadata(video.path);
        if (metadata && metadata.duration) {
          setDuration(metadata.duration);
        }

        // Load saved seams if any
        const savedData = await window.api.getSeams(video.path);
        if (savedData) {
          if (savedData.seams && savedData.seams.length > 0) {
            setSeams(savedData.seams);
            setSaved(true);
          }

          if (savedData.segmentNames && savedData.segmentNames.length > 0) {
            setSegmentNames(savedData.segmentNames);
          }

          if (savedData.textOverlay) {
            setTextOverlays(savedData.textOverlay);
          }
        } else {
          // Start with the beginning of the video as the first seam
          setSeams([{ time: 0, label: "Start" }]);
        }
      } catch (error) {
        console.error("Error loading video data:", error);
      }
    };

    loadSeams();
  }, [video.path]);

  // Array of segment colors for the timeline visualization
  const segmentColors = [
    "rgba(41, 128, 185, 0.5)", // Blue
    "rgba(39, 174, 96, 0.5)", // Green
    "rgba(142, 68, 173, 0.5)", // Purple
    "rgba(243, 156, 18, 0.5)", // Orange
  ];

  // Drag handling
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const startDragging = (e, index) => {
    // Don't allow dragging the first marker (start)
    if (index === 0) return;

    setIsDragging(true);
    setDragIndex(index);

    // Add event listeners for drag and release
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", stopDragging);

    // Prevent default to avoid text selection
    e.preventDefault();
  };

  const handleDragMove = (e) => {
    if (!isDragging || dragIndex === null) return;

    // Get timeline element for position calculation
    const timeline = document.querySelector(".timeline");
    if (!timeline) return;

    // Calculate position relative to timeline
    const rect = timeline.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const percentX = relativeX / rect.width;
    const newTime = percentX * duration;

    // Update the seam position
    handleDragSeam(dragIndex, newTime);
  };

  const stopDragging = () => {
    setIsDragging(false);
    setDragIndex(null);

    // Remove event listeners
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", stopDragging);
  };

  // Cleanup drag handlers on component unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", stopDragging);
    };
  }, [isDragging, dragIndex]);

  // Add a new seam at current time
  const handleAddSeam = () => {
    const newSeam = {
      time: currentTime,
      label: `Seam ${seams.length}`,
      start: seams.length === 0 ? true : false, // Mark as start if it's the first seam
      end: false,
    };

    // Add to seams array
    const newSeams = [...seams, newSeam];

    // Sort seams by time
    newSeams.sort((a, b) => a.time - b.time);

    setSeams(newSeams);
    setSaved(false);
  };

  // Handle dragging a seam to a new position
  const handleDragSeam = (index, newTime) => {
    // Don't allow dragging beyond video duration
    if (newTime < 0 || newTime > duration) return;

    // Don't allow the first seam to be moved from 0
    if (index === 0) return;

    const updatedSeams = [...seams];
    updatedSeams[index].time = newTime;

    // Resort seams (in case the drag caused a reordering)
    updatedSeams.sort((a, b) => a.time - b.time);

    setSeams(updatedSeams);
    setSaved(false);
  };

  // Update a segment name
  const handleUpdateSegmentName = (index, newName) => {
    const newNames = [...segmentNames];
    newNames[index] = newName;
    setSegmentNames(newNames);
    setSaved(false);
  };

  const handleSeamClick = (time) => {
    // Seek to the seam time
    if (playerRef.current) {
      playerRef.current.seekTo(time);
    }
  };

  const handleDeleteSeam = (index) => {
    // Don't allow deleting the first seam (start of video)
    if (index === 0) return;

    const newSeams = seams.filter((_, i) => i !== index);
    setSeams(newSeams);
    setSaved(false);
  };

  const handleSaveSeams = async () => {
    setSaving(true);

    try {
      await window.api.saveSeams({
        videoPath: video.path,
        seams: seams,
        segmentNames: segmentNames,
        textOverlay: textOverlays,
      });

      setSaved(true);
      onMarkProcessed(true);
    } catch (error) {
      console.error("Error saving seams:", error);
    } finally {
      setSaving(false);
    }
  };

  // Check if any segment is longer than 3 minutes (180 seconds)
  const longSegments = [];
  for (let i = 0; i < seams.length - 1; i++) {
    const duration = seams[i + 1].time - seams[i].time;
    if (duration > 180) {
      longSegments.push({
        index: i,
        start: seams[i].time,
        end: seams[i + 1].time,
        duration,
      });
    }
  }

  // Format time as MM:SS
  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Update a seam's time to current playback time
  const setSeamToCurrentTime = (index) => {
    if (index === 0) return; // Don't allow changing the first seam (start of video)

    const updatedSeams = [...seams];
    updatedSeams[index].time = currentTime;

    // Resort seams to maintain time order
    updatedSeams.sort((a, b) => a.time - b.time);

    setSeams(updatedSeams);
    setSaved(false);
  };
  const handleProgress = (state) => {
    setCurrentTime(state.playedSeconds);
  };

  return (
    <div className="video-editor">
      <div className="editor-header">
        <button className="back-button" onClick={onBack}>
          <FaArrowLeft /> Back to List
        </button>
        <h2>Editing: {video.name}</h2>
        <button
          className={`save-button ${saved ? "saved" : ""}`}
          onClick={handleSaveSeams}
          disabled={saving}
        >
          <FaSave /> {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="all-content">
        <div className="video-container">
          <ReactPlayer
            ref={playerRef}
            url={`local-video://${video.path}`}
            width="100%"
            height="100%"
            controls={true}
            playing={playing}
            onProgress={handleProgress}
            onDuration={setDuration}
            progressInterval={100}
          />
        </div>
        <div className="editor-content">
          <div className="timeline-container">
            <div className="current-time">
              <FaRegClock /> {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            {/* Enhanced interactive timeline */}
            <div className="timeline">
              {/* Render segment blocks in the timeline */}
              {seams.length > 1 &&
                seams.slice(0, -1).map((seam, index) => {
                  const nextSeam = seams[index + 1];
                  const leftPos = (seam.time / duration) * 100;
                  const rightPos = (nextSeam.time / duration) * 100;
                  const width = rightPos - leftPos;

                  return (
                    <div
                      key={`segment-${index}`}
                      className="timeline-segment"
                      style={{
                        left: `${leftPos}%`,
                        width: `${width}%`,
                        backgroundColor:
                          segmentColors[index % segmentColors.length],
                      }}
                      title={segmentNames[index] || `Segment ${index + 1}`}
                    />
                  );
                })}

              {/* Render draggable seam markers */}
              {seams.map((seam, index) => (
                <div
                  key={`seam-${index}`}
                  className={`seam-marker ${index === 0 ? "start-marker" : ""}`}
                  style={{ left: `${(seam.time / duration) * 100}%` }}
                  onClick={() => handleSeamClick(seam.time)}
                  onMouseDown={(e) => startDragging(e, index)}
                  title={`${formatTime(seam.time)} - ${
                    index === 0
                      ? "Start"
                      : segmentNames[index - 1] || `Segment ${index}`
                  }`}
                >
                  <div className="seam-label">
                    {index === 0 ? "Start" : index}
                  </div>
                </div>
              ))}

              {/* Current playback position */}
              <div
                className="current-time-marker"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>

            {/* Controls for adding new seams */}
            <div className="timeline-controls">
              <button className="add-seam-button" onClick={handleAddSeam}>
                <FaPlus /> Add Seam at Current Position
              </button>
            </div>
          </div>

          <div className="segments-container">
            <h3>Segments</h3>

            {seams.length <= 1 ? (
              <p className="no-segments">Add seams to create segments</p>
            ) : (
              <table className="segments-table">
                <thead>
                  <tr>
                    <th>Segment Name</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Duration</th>
                    <th>Text Overlay</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {seams.slice(0, -1).map((seam, index) => {
                    const nextSeam = seams[index + 1];
                    const segmentDuration = nextSeam.time - seam.time;
                    const isLong = segmentDuration > 180;

                    return (
                      <tr key={index} className={isLong ? "long-segment" : ""}>
                        <td>
                          <input
                            type="text"
                            className="segment-name-input"
                            value={
                              segmentNames[index] ||
                              defaultPartLabels[index] ||
                              `Segment ${index + 1}`
                            }
                            onChange={(e) =>
                              handleUpdateSegmentName(index, e.target.value)
                            }
                          />
                        </td>
                        <td>
                          {formatTime(seam.time)}
                          <button
                            className="set-time-button"
                            onClick={() => setSeamToCurrentTime(index)}
                            title="Set start to current time"
                            disabled={index === 0}
                          >
                            <FaClock />
                          </button>
                        </td>
                        <td>
                          {formatTime(nextSeam.time)}
                          <button
                            className="set-time-button"
                            onClick={() => setSeamToCurrentTime(index + 1)}
                            title="Set end to current time"
                          >
                            <FaClock />
                          </button>
                        </td>
                        <td>
                          {formatTime(segmentDuration)}
                          {isLong && (
                            <span
                              className="warning-icon"
                              title="Segment longer than 3 minutes"
                            >
                              <FaExclamationTriangle />
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="text-overlay-input"
                            placeholder="Add animated text..."
                            value={textOverlays[index] || ""}
                            onChange={(e) => {
                              const newTextOverlays = [...textOverlays];
                              newTextOverlays[index] = e.target.value;
                              setTextOverlays(newTextOverlays);
                              setSaved(false);
                            }}
                          />
                        </td>
                        <td>
                          <button
                            className="delete-seam-button"
                            onClick={() => handleDeleteSeam(index + 1)}
                            title="Delete end seam"
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {longSegments.length > 0 && (
              <div className="warning-message">
                <FaExclamationTriangle /> Warning: {longSegments.length}{" "}
                segment(s) longer than 3 minutes
              </div>
            )}

            {/* Text Overlay Settings Button */}
            <button
              className="overlay-settings-button"
              onClick={() => setShowOverlaySettings(!showOverlaySettings)}
            >
              {showOverlaySettings
                ? "Hide Overlay Settings"
                : "Show Overlay Settings"}
            </button>

            {/* Text Overlay Settings Panel */}
            {showOverlaySettings && (
              <div className="overlay-settings-panel">
                <h4>Text Overlay Settings</h4>
                <p>
                  The text you add to each segment will be animated and added to
                  the top of your video.
                </p>
                <p>Settings will apply to all text overlays in this video.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoEditor;
