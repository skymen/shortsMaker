const { createVideoWithTextOverlay } = require("./addAnimatedText");

// Advanced usage with custom configuration
async function advancedExample() {
  await createVideoWithTextOverlay({
    inputVideoPath: "./Livre 2 Maman vidéos/shorts/Partie1_Cours.mp4",
    outputVideoPath: "./Livre 2 Maman vidéos/shorts/Partie1_Cours_out.mp4",
    text: "Chapitre 1 - Leçon 1\n Partie 1\nCours",
    tempDir: "./my_temp_files",
    fontFamily: "Raleway",
    fontWeight: "bold",
    fontSize: 60,
    fontColor: "#FFFFFF",
    textAlign: "center", // 'left', 'center', or 'right'
    // textX: 400, // Custom X position (optional, default is center)
    // textY: 300, // Custom Y position (optional, default is center)
    rectColor: "rgba(33, 150, 243, 0.8)", // Blue background with 80% opacity
    rectPadding: 30,
    rectRadius: 20,
    startTime: 0,
    fadeInDuration: 0.3,
    stayDuration: 2,
    fadeOutDuration: 0.3,
    keepTempFiles: false,
    slideDistance: 100,
  });
}

advancedExample().catch(console.error);
