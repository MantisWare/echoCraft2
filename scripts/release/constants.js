const UPDATE_FEED_URL =
  "https://storage.mantisware.co.za/public.php/dav/files/T9p24tDSSKr5jG7/app/";
const PUBLIC_SHARE_URL = "https://storage.mantisware.co.za/s/T9p24tDSSKr5jG7";
const DEFAULT_NC_URL = "https://storage.mantisware.co.za";
const DEFAULT_NC_USER = "admin";
const DEFAULT_REMOTE_FOLDER = "/Public/echocraft/app";
const MAC_SIGNING_IDENTITY = "Developer ID Application: Waldo Marais (Z2BVWT9X93)";
const MAC_TEAM_ID = "Z2BVWT9X93";
const WINDOWS_PUBLISHER_NAME = "MANTISWARE";

const PLATFORMS = {
  mac: {
    id: "mac",
    host: "darwin",
    arch: "arm64",
    manifest: "latest-mac.yml",
    npmScript: "build:mac",
    builderArgs: ["--arm64", "--publish", "always"],
    skipVersionBump: true,
    appGlob: "mac*/EchoCraft.app",
  },
  win: {
    id: "win",
    host: "win32",
    arch: "x64",
    manifest: "latest.yml",
    npmScript: "build:win",
    builderArgs: ["--x64", "--publish", "always"],
    skipVersionBump: false,
  },
  linux: {
    id: "linux",
    host: "linux",
    arch: "x64",
    manifest: "latest-linux.yml",
    npmScript: "build:linux",
    builderArgs: ["--x64", "--publish", "always"],
    skipVersionBump: false,
  },
};

const PLATFORM_NAME_MARKERS = {
  mac: ["-darwin-"],
  win: ["-win32-"],
  linux: ["-linux-"],
};

const ARTIFACT_EXTENSIONS = {
  mac: [".dmg", ".zip", ".blockmap"],
  win: [".exe", ".blockmap"],
  linux: [".AppImage", ".deb", ".rpm", ".tar.gz", ".blockmap"],
};

const EXCLUDED_BASENAMES = new Set([
  "builder-debug.yml",
  "builder-effective-config.yaml",
]);

module.exports = {
  UPDATE_FEED_URL,
  PUBLIC_SHARE_URL,
  DEFAULT_NC_URL,
  DEFAULT_NC_USER,
  DEFAULT_REMOTE_FOLDER,
  MAC_SIGNING_IDENTITY,
  MAC_TEAM_ID,
  WINDOWS_PUBLISHER_NAME,
  PLATFORMS,
  PLATFORM_NAME_MARKERS,
  ARTIFACT_EXTENSIONS,
  EXCLUDED_BASENAMES,
};
