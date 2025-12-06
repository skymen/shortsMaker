import React, { useState, useEffect } from "react";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
} from "react-icons/fa";
// Force-load react-icons
import "@react-icons/all-files/fa/FaArrowLeft";
import "@react-icons/all-files/fa/FaCheckCircle";
import "@react-icons/all-files/fa/FaTimesCircle";
import "@react-icons/all-files/fa/FaSpinner";
import "./BatchProcessor.css";

const BatchProcessor = ({ videos, onExit }) => {
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [completed, setCompleted] = useState(false);

  const startProcessing = async () => {
    setProcessing(true);

    try {
      const processingResults = await window.api.processVideos(videos);
      setResults(processingResults);
      setCompleted(true);
    } catch (error) {
      console.error("Error processing videos:", error);
    } finally {
      setProcessing(false);
    }
  };

  // Auto-start processing when component mounts
  useEffect(() => {
    startProcessing();
  }, []);

  const getResultIcon = (result) => {
    if (result) {
      if (result.success) {
        return <FaCheckCircle className="success-icon" />;
      } else {
        return <FaTimesCircle className="error-icon" />;
      }
    }
    return <FaSpinner className="spinner" />;
  };

  return (
    <div className="batch-processor">
      <div className="processor-header">
        <button className="back-button" onClick={onExit} disabled={processing}>
          <FaArrowLeft /> Back to List
        </button>
        <h2>Batch Processing</h2>
      </div>

      <div className="processor-content">
        <div className="status-message">
          {processing ? (
            <p>Processing videos... Please wait.</p>
          ) : completed ? (
            <p>
              Processing completed. {results.filter((r) => r.success).length} of{" "}
              {results.length} videos processed successfully.
            </p>
          ) : (
            <p>Ready to process {videos.length} videos.</p>
          )}
        </div>

        <div className="videos-status">
          {videos.map((video, index) => {
            const result = results[index];
            return (
              <div
                key={video.path}
                className={`video-status ${
                  result ? (result.success ? "success" : "error") : ""
                }`}
              >
                <div className="status-icon">{getResultIcon(result)}</div>
                <div className="video-info">
                  <div className="video-name">{video.name}</div>
                  {result && <div className="message">{result.message}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {!processing && !completed && (
          <button className="process-button" onClick={startProcessing}>
            Start Processing
          </button>
        )}

        {completed && (
          <button className="back-to-list-button" onClick={onExit}>
            Return to Video List
          </button>
        )}
      </div>
    </div>
  );
};

export default BatchProcessor;
