import React from "react";
import { FaCheck, FaTimes, FaEdit } from "react-icons/fa";
// Force-load react-icons
import "@react-icons/all-files/fa/FaCheck";
import "@react-icons/all-files/fa/FaTimes";
import "@react-icons/all-files/fa/FaEdit";
import "./VideoList.css";

const VideoList = ({ videos, onSelectVideo }) => {
  return (
    <div className="video-list">
      {videos.length === 0 ? (
        <p className="no-videos">No videos found in the selected folder</p>
      ) : (
        <table className="video-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr
                key={video.path}
                className={video.processed ? "processed" : ""}
              >
                <td>{video.name}</td>
                <td>
                  {video.processed ? (
                    <span className="status processed">
                      <FaCheck /> Processed
                    </span>
                  ) : (
                    <span className="status not-processed">
                      <FaTimes /> Not Processed
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="edit-button"
                    onClick={() => onSelectVideo(video)}
                  >
                    <FaEdit /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default VideoList;
