const path = require("path");
const fs = require("fs");
const os = require("os");

// Clean build directories
console.log("🧹 Cleaning build directories...");
const dirsToClean = ["dist/", "src/dist/", "node_modules/.cache/"];

dirsToClean.forEach((dir) => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✅ Cleaned: ${dir}`);
  } else {
    console.log(`ℹ️ Directory not found: ${dir}`);
  }
});

// Clean development database
console.log("🗄️ Cleaning development database...");
try {
  // Mirrors configureChannelUserDataPath() in main.js: development runs are
  // isolated under EchoCraft-development, away from the packaged app's data.
  const appDataDir =
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? process.env.APPDATA || os.homedir()
        : path.join(os.homedir(), ".config");
  const userDataPath = path.join(appDataDir, "EchoCraft-development");

  const devDbPath = path.join(userDataPath, "transcriptions-dev.db");

  // Clean development database
  if (fs.existsSync(devDbPath)) {
    fs.unlinkSync(devDbPath);
    console.log(`✅ Development database cleaned: ${devDbPath}`);
  } else {
    console.log("ℹ️ No development database found to clean");
  }
} catch (error) {
  console.error("❌ Error cleaning database files:", error.message);
}

console.log("✨ Cleanup completed successfully!");
