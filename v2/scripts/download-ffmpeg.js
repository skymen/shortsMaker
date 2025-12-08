/**
 * Download FFmpeg.wasm assets for local serving
 * Run: node scripts/download-ffmpeg.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const ASSETS_DIR = path.join(__dirname, "../public/assets/ffmpeg");

const FILES = [
  {
    url: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.min.js",
    dest: "ffmpeg.js",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.min.js",
    dest: "ffmpeg-util.js",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
    dest: "ffmpeg-core.js",
  },
  {
    url: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
    dest: "ffmpeg-core.wasm",
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const destPath = path.join(ASSETS_DIR, dest);
    console.log(`Downloading ${dest}...`);

    const file = fs.createWriteStream(destPath);

    https
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          download(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download ${url}: ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          const size = fs.statSync(destPath).size;
          console.log(`  ✓ ${dest} (${(size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

async function main() {
  console.log("📦 Downloading FFmpeg.wasm assets...\n");

  // Create assets directory
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // Download all files
  for (const file of FILES) {
    try {
      await download(file.url, file.dest);
    } catch (err) {
      console.error(`  ✗ Failed to download ${file.dest}:`, err.message);
      process.exit(1);
    }
  }

  console.log("\n✅ All FFmpeg assets downloaded to public/assets/ffmpeg/");
  console.log("   You can now use FFmpeg.wasm locally!");
}

main();
