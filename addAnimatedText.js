const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { execSync } = require("child_process");

/**
 * Creates a video with text overlay using the absolute simplest approach possible
 * With fade in/out effects
 *
 * @param {Object} config - Configuration object
 * @param {string} config.inputVideoPath - Path to the input video
 * @param {string} config.outputVideoPath - Path to save the output video
 * @param {string} config.text - Text to display (can be multiline with \n)
 * @param {string} config.tempDir - Directory for temporary files (default: './temp')
 * @param {string} config.fontFamily - Font family (default: 'sans-serif')
 * @param {number} config.fontSize - Font size in pixels (default: 40)
 * @param {string} config.fontColor - Font color (default: 'white')
 * @param {string} config.textAlign - Text alignment: 'left', 'center', 'right' (default: 'center')
 * @param {number} config.textX - X position of text (default: center of video)
 * @param {number} config.textY - Y position of text (default: center of video)
 * @param {string} config.rectColor - Background rectangle color (default: 'rgba(0, 0, 0, 0.6)')
 * @param {number} config.rectPadding - Padding around text in pixels (default: 20)
 * @param {number} config.rectRadius - Border radius of rectangle in pixels (default: 10)
 * @param {number} config.startTime - Time to start showing overlay in seconds (default: 0)
 * @param {number} config.duration - Total duration to show overlay, including fades (default: 5)
 * @param {number} config.fadeInDuration - Duration of fade in effect in seconds (default: 1)
 * @param {number} config.stayDuration - Duration to stay on screen in seconds (default: 3)
 * @param {number} config.fadeOutDuration - Duration of fade out effect in seconds (default: 1)
 * @param {boolean} config.slideDistance - Keep temporary files (default: false)
 * @param {boolean} config.keepTempFiles - Keep temporary files (default: false)
 * @returns {Promise<void>} - Promise that resolves when video is created
 */
async function createVideoWithTextOverlay(config) {
  // Set default values
  const defaults = {
    tempDir: "./temp",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fontSize: 40,
    fontColor: "white",
    textAlign: "center",
    rectColor: "rgba(0, 0, 0, 0.6)",
    rectPadding: 20,
    rectRadius: 10,
    startTime: 0,
    duration: 5,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    slideDistance: 50,
  };

  // Merge defaults with provided config
  config = { ...defaults, ...config };

  // Calculate the total duration if old configuration style is used
  if (config.stayDuration) {
    config.duration =
      config.fadeInDuration + config.stayDuration + config.fadeOutDuration;
  }

  // Validate required parameters
  if (!config.inputVideoPath || !config.outputVideoPath || !config.text) {
    throw new Error("inputVideoPath, outputVideoPath, and text are required");
  }

  // Make sure fade durations don't exceed total duration
  if (config.fadeInDuration + config.fadeOutDuration > config.duration) {
    const originalFadeIn = config.fadeInDuration;
    const originalFadeOut = config.fadeOutDuration;

    // Adjust fade durations proportionally
    const totalFadeDuration = config.duration * 0.8; // Reserve 80% of duration for fades
    const ratio = originalFadeIn / (originalFadeIn + originalFadeOut);

    config.fadeInDuration = totalFadeDuration * ratio;
    config.fadeOutDuration = totalFadeDuration * (1 - ratio);

    console.warn(
      `Warning: Fade durations (${originalFadeIn}s in, ${originalFadeOut}s out) exceed total duration (${
        config.duration
      }s). Adjusted to ${config.fadeInDuration.toFixed(
        2
      )}s in, ${config.fadeOutDuration.toFixed(2)}s out.`
    );
  }

  // Create temp directory if it doesn't exist
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  // Get video dimensions using ffprobe
  console.log("Getting video dimensions...");
  const videoInfoCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${config.inputVideoPath}"`;
  const dimensions = execSync(videoInfoCmd).toString().trim().split("x");
  const videoWidth = parseInt(dimensions[0]);
  const videoHeight = parseInt(dimensions[1]);

  // Create SVG with text and rounded rectangle
  const textLines = config.text.split("\n");

  // Estimate text dimensions (this is approximate)
  const charWidth = config.fontSize * 0.6; // Approximate width of a character
  const lineHeight = config.fontSize * 1.2;
  const textWidth = Math.max(
    ...textLines.map((line) => line.length * charWidth)
  );
  const textHeight = lineHeight * textLines.length;

  // Calculate text position if not specified
  if (!config.textX) {
    config.textX = videoWidth / 2;
  }

  if (!config.textY) {
    config.textY = videoHeight / 2;
  }

  // Calculate rectangle dimensions
  const rectWidth = textWidth + config.rectPadding * 2;
  const rectHeight = textHeight + config.rectPadding * 2;

  // Calculate rectangle position based on text alignment
  let rectX;
  switch (config.textAlign) {
    case "left":
      rectX = config.textX;
      break;
    case "right":
      rectX = config.textX - rectWidth;
      break;
    default: // center
      rectX = config.textX - rectWidth / 2;
      break;
  }

  const rectY = config.textY - rectHeight / 2;

  // Create SVG with text and rounded rectangle
  const textSvg = `<svg width="${videoWidth}" height="${videoHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="${rectX}"
      y="${rectY}"
      width="${rectWidth}"
      height="${rectHeight}"
      rx="${config.rectRadius}"
      ry="${config.rectRadius}"
      fill="${config.rectColor}"
    />
    ${textLines
      .map((line, i) => {
        const yPos =
          rectY + config.rectPadding + i * lineHeight + config.fontSize * 0.8;
        let xPos;

        switch (config.textAlign) {
          case "left":
            xPos = rectX + config.rectPadding;
            break;
          case "right":
            xPos = rectX + rectWidth - config.rectPadding;
            break;
          default: // center
            xPos = rectX + rectWidth / 2;
            break;
        }

        return `<text
        x="${xPos}"
        y="${yPos}"
        font-family="${config.fontFamily}"
        font-size="${config.fontSize}px"
        font-weight="${config.fontWeight}"
        fill="${config.fontColor}"
        text-anchor="${
          config.textAlign === "left"
            ? "start"
            : config.textAlign === "right"
            ? "end"
            : "middle"
        }"
      >${line}</text>`;
      })
      .join("\n")}
  </svg>`;

  // Save SVG to temp file
  const svgPath = path.join(config.tempDir, "text_overlay.svg");
  fs.writeFileSync(svgPath, textSvg);

  // Convert SVG to PNG with transparency using sharp
  const overlayImagePath = path.join(config.tempDir, "text_overlay.png");
  console.log(`Creating overlay image at ${overlayImagePath}...`);

  await sharp(Buffer.from(textSvg)).png().toFile(overlayImagePath);

  console.log("Applying overlay to video with fade effects...");

  // Helper function to get video duration
  function getVideoDuration(videoPath) {
    try {
      const durationCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
      const duration = parseFloat(execSync(durationCmd).toString().trim());
      return duration;
    } catch (error) {
      console.error("Error getting video duration:", error);
      return 0;
    }
  }

  try {
    // Calculate time points for fade in/out
    const fadeInStart = config.startTime;
    const fadeInEnd = config.startTime + config.fadeInDuration;
    const fadeOutStart =
      config.startTime + config.duration - config.fadeOutDuration;
    const fadeOutEnd = config.startTime + config.duration;

    console.log(
      `Adding overlay with fade in from ${fadeInStart}s to ${fadeInEnd}s...`
    );
    console.log(`Overlay stays until ${fadeOutStart}s...`);
    console.log(`Overlay fades out from ${fadeOutStart}s to ${fadeOutEnd}s...`);

    // Create a filter complex with simpler expressions that FFmpeg can handle
    console.log("Creating fade and slide effects with compatible syntax...");

    // Set slide distances (how far to slide from/to)
    const slideDistance = config.slideDistance; // pixels to slide

    // For fade-in animation calculations
    const fadeInStartTime = fadeInStart;
    const fadeInAnimDuration = config.fadeInDuration;

    // For fade-out animation calculations
    const fadeOutStartTime = fadeOutStart;
    const fadeOutAnimDuration = config.fadeOutDuration;

    // Build overlay filter with simpler expressions
    // Use separate expressions for fade-in and fade-out to avoid nested if statements
    const filterComplex = `
      [1:v]format=rgba,
      fade=t=in:st=0:d=${fadeInAnimDuration}:alpha=1,
      fade=t=out:st=${
        config.duration - fadeOutAnimDuration
      }:d=${fadeOutAnimDuration}:alpha=1
      [faded];
      [0:v][faded]overlay=
        0:
        'if(between(t,${fadeInStartTime},${
      fadeInStartTime + fadeInAnimDuration
    }),
          ${-slideDistance}+(t-${fadeInStartTime})/${fadeInAnimDuration}*${slideDistance},
          if(between(t,${fadeOutStartTime},${
      fadeOutStartTime + fadeOutAnimDuration
    }),
            (t-${fadeOutStartTime})/${fadeOutAnimDuration}*${slideDistance},
            0)
        )':
        enable='between(t,${fadeInStartTime},${
      fadeOutStartTime + fadeOutAnimDuration
    })'
    `.replace(/\n\s+/g, "");

    // Use the filter in FFmpeg command - direct PNG approach
    execSync(
      `ffmpeg -y -i "${
        config.inputVideoPath
      }" -loop 1 -i "${overlayImagePath}" -filter_complex "${filterComplex}" -map 0:a? -c:a copy -shortest -t ${Math.max(
        config.startTime + config.duration,
        getVideoDuration(config.inputVideoPath)
      )} "${config.outputVideoPath}"`,
      {
        stdio: "inherit",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer to handle large outputs
      }
    );

    console.log(`Video with fade effects saved to ${config.outputVideoPath}`);

    // Clean up temporary files
    if (!config.keepTempFiles) {
      console.log("Cleaning up temporary files...");

      // Delete temp files
      const filesToDelete = [svgPath, overlayImagePath];
      filesToDelete.forEach((file) => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
    }
  } catch (error) {
    console.error("Error processing video:", error);
    throw error;
  }
}

module.exports = { createVideoWithTextOverlay };

// Example usage:
/*
const config = {
  inputVideoPath: 'input.mp4',
  outputVideoPath: 'output.mp4',
  text: 'Hello World\nMultiple Lines',
  fontSize: 60,
  fontColor: 'white',
  rectColor: 'rgba(0, 0, 0, 0.7)',
  rectRadius: 15,
  startTime: 2,
  duration: 5,
  fadeInDuration: 1,
  fadeOutDuration: 1,
  keepTempFiles: false  // Set to true for debugging
};

createVideoWithTextOverlay(config).catch(console.error);
*/
