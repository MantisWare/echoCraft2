const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");

const {
  parseUpdateYml,
  selectReleaseArtifacts,
  discoverUploadablePlatforms,
  validateManifest,
  buildUploadPlan,
  readPackageIdentity,
  sha512Base64,
} = require("../../scripts/release/artifacts");
const { parseArgs, validateNativeHost, getPlatformConfig } = require("../../scripts/release/platform");
const {
  parseEnvFile,
  getUploadConfig,
  requireReleaseCredentials,
  loadReleaseEnv,
  loadUploadEnv,
  requireUploadCredentials,
  prepareBuildEnv,
} = require("../../scripts/release/env");
const { publishPlatform, uploadFile, davFileUrl } = require("../../scripts/release/publisher");
const { parseUploadArgs } = require("../../scripts/upload.js");
const { hasMacSigningIdentity } = require("../../scripts/release/verify");
const {
  electronBuilderTempKeychainPath,
  parseKeychainSearchList,
  withoutStaleSigningKeychains,
} = require("../../scripts/release/macKeychain");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echocraft-release-"));
}

function writeFile(dir, name, contents) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function sha512Of(contents) {
  return crypto.createHash("sha512").update(contents).digest("base64");
}

test("parseArgs requires a single platform and accepts dry-run flags", () => {
  assert.deepEqual(parseArgs(["node", "release.js", "mac", "--dry-run"]), {
    platformId: "mac",
    dryRun: true,
    skipBuild: false,
    skipVerify: false,
    skipUpload: false,
    bump: "patch",
  });
  assert.throws(() => parseArgs(["node", "release.js"]), /Usage/);
  assert.throws(() => parseArgs(["node", "release.js", "mac", "--nope"]), /Unknown option/);
});

test("parseArgs bumps macOS by default and rejects bump on other platforms", () => {
  assert.equal(parseArgs(["node", "release.js", "mac"]).bump, "patch");
  assert.equal(parseArgs(["node", "release.js", "mac", "--no-bump"]).bump, null);
  assert.equal(parseArgs(["node", "release.js", "mac", "--bump", "minor"]).bump, "minor");
  assert.equal(parseArgs(["node", "release.js", "mac", "--bump", "2.1.0"]).bump, "2.1.0");
  assert.equal(parseArgs(["node", "release.js", "win"]).bump, null);
  assert.equal(parseArgs(["node", "release.js", "linux", "--no-bump"]).bump, null);
  assert.throws(
    () => parseArgs(["node", "release.js", "win", "--bump", "patch"]),
    /macOS-only/
  );
  assert.throws(
    () => parseArgs(["node", "release.js", "linux", "--bump", "1.0.0"]),
    /macOS-only/
  );
  assert.throws(() => parseArgs(["node", "release.js", "mac", "--bump"]), /--bump needs/);
});

test("validateNativeHost rejects the wrong OS and architecture", () => {
  assert.doesNotThrow(() => validateNativeHost("mac", { platform: "darwin", arch: "arm64" }));
  assert.throws(
    () => validateNativeHost("mac", { platform: "darwin", arch: "x64" }),
    /arm64 only/
  );
  assert.throws(
    () => validateNativeHost("win", { platform: "darwin", arch: "x64" }),
    /must run on win32/
  );
  assert.throws(
    () => validateNativeHost("linux", { platform: "linux", arch: "arm64" }),
    /x64 only/
  );
  assert.throws(() => getPlatformConfig("solaris"), /Unknown release platform/);
});

test("selectReleaseArtifacts is platform-scoped and ignores updater dumps", () => {
  const names = [
    "EchoCraft-darwin-arm64.dmg",
    "EchoCraft-darwin-arm64.zip",
    "EchoCraft-darwin-arm64.zip.blockmap",
    "latest-mac.yml",
    "EchoCraft-win32-x64.exe",
    "EchoCraft-win32-x64.exe.blockmap",
    "latest.yml",
    "EchoCraft-linux-x64.AppImage",
    "latest-linux.yml",
    "builder-debug.yml",
    "builder-effective-config.yaml",
  ];

  const mac = selectReleaseArtifacts(names, "mac");
  assert.equal(mac.manifest, "latest-mac.yml");
  assert.deepEqual(mac.artifacts.sort(), [
    "EchoCraft-darwin-arm64.dmg",
    "EchoCraft-darwin-arm64.zip",
    "EchoCraft-darwin-arm64.zip.blockmap",
  ]);

  const win = selectReleaseArtifacts(names, "win");
  assert.equal(win.manifest, "latest.yml");
  assert.deepEqual(win.artifacts.sort(), [
    "EchoCraft-win32-x64.exe",
    "EchoCraft-win32-x64.exe.blockmap",
  ]);

  const linux = selectReleaseArtifacts(names, "linux");
  assert.equal(linux.manifest, "latest-linux.yml");
  assert.deepEqual(linux.artifacts, ["EchoCraft-linux-x64.AppImage"]);
});

test("discoverUploadablePlatforms reports ready, missing, and incomplete sets", () => {
  const all = discoverUploadablePlatforms([
    "EchoCraft-win32-x64.exe",
    "latest.yml",
    "EchoCraft-darwin-arm64.dmg",
  ]);
  const byId = Object.fromEntries(all.map((entry) => [entry.id, entry]));
  assert.equal(byId.win.status, "ready");
  assert.equal(byId.mac.status, "incomplete");
  assert.match(byId.mac.reason, /latest-mac.yml/);
  assert.equal(byId.linux.status, "missing");
  assert.match(byId.linux.reason, /latest-linux.yml/);
});

test("parseUploadArgs accepts dry-run and rejects unknown flags", () => {
  assert.deepEqual(parseUploadArgs(["node", "upload.js"]), { dryRun: false });
  assert.deepEqual(parseUploadArgs(["node", "upload.js", "--dry-run"]), { dryRun: true });
  assert.throws(() => parseUploadArgs(["node", "upload.js", "--nope"]), /Unknown option/);
});

test("parseUpdateYml reads version, files, and checksums", () => {
  const parsed = parseUpdateYml(`
version: 2.0.5
files:
  - url: EchoCraft-darwin-arm64.zip
    sha512: abc==
    size: 10
  - url: EchoCraft-darwin-arm64.dmg
    sha512: def==
    size: 20
path: EchoCraft-darwin-arm64.zip
sha512: abc==
releaseDate: '2026-09-16T00:00:00.000Z'
`);
  assert.equal(parsed.version, "2.0.5");
  assert.equal(parsed.path, "EchoCraft-darwin-arm64.zip");
  assert.equal(parsed.sha512, "abc==");
  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.files[0].url, "EchoCraft-darwin-arm64.zip");
  assert.equal(parsed.files[1].size, 20);
});

test("parseUpdateYml rejects empty or malformed manifests", () => {
  assert.throws(() => parseUpdateYml(""), /empty/);
  assert.throws(() => parseUpdateYml("files:\n  - url: x.zip\n"), /missing version/);
  assert.throws(() => parseUpdateYml("version: 1.0.0\n"), /lists no files/);
});

test("validateManifest checks version, presence, size, and sha512", () => {
  const dir = makeTempDir();
  try {
    const zip = Buffer.from("zip-bytes");
    const dmg = Buffer.from("dmg-bytes-xx");
    writeFile(dir, "EchoCraft-darwin-arm64.zip", zip);
    writeFile(dir, "EchoCraft-darwin-arm64.dmg", dmg);

    const manifest = {
      version: "2.0.5",
      files: [
        {
          url: "EchoCraft-darwin-arm64.zip",
          sha512: sha512Of(zip),
          size: zip.length,
        },
        {
          url: "EchoCraft-darwin-arm64.dmg",
          sha512: sha512Of(dmg),
          size: dmg.length,
        },
      ],
    };

    const referenced = validateManifest({
      manifest,
      outputDir: dir,
      expectedVersion: "2.0.5",
      selectedArtifacts: [
        "EchoCraft-darwin-arm64.zip",
        "EchoCraft-darwin-arm64.dmg",
      ],
    });
    assert.deepEqual(referenced, [
      "EchoCraft-darwin-arm64.zip",
      "EchoCraft-darwin-arm64.dmg",
    ]);
    assert.equal(sha512Base64(path.join(dir, "EchoCraft-darwin-arm64.zip")), sha512Of(zip));

    assert.throws(
      () =>
        validateManifest({
          manifest,
          outputDir: dir,
          expectedVersion: "2.0.6",
          selectedArtifacts: referenced,
        }),
      /does not match package version/
    );

    assert.throws(
      () =>
        validateManifest({
          manifest: {
            version: "2.0.5",
            files: [{ url: "missing.zip", sha512: "x", size: 1 }],
          },
          outputDir: dir,
          expectedVersion: "2.0.5",
          selectedArtifacts: [],
        }),
      /missing file/
    );

    assert.throws(
      () =>
        validateManifest({
          manifest: {
            version: "2.0.5",
            files: [
              {
                url: "EchoCraft-darwin-arm64.zip",
                sha512: "not-the-hash",
                size: zip.length,
              },
            ],
          },
          outputDir: dir,
          expectedVersion: "2.0.5",
          selectedArtifacts: ["EchoCraft-darwin-arm64.zip"],
        }),
      /checksum mismatch/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildUploadPlan puts the platform manifest last and never mixes it into artifacts", () => {
  const plan = buildUploadPlan({
    artifacts: ["EchoCraft-win32-x64.exe", "EchoCraft-win32-x64.exe.blockmap"],
    manifestName: "latest.yml",
    referencedUrls: ["EchoCraft-win32-x64.exe"],
  });

  assert.deepEqual(plan.order.slice(-1), ["latest.yml"]);
  assert.equal(plan.order.indexOf("EchoCraft-win32-x64.exe") < plan.order.indexOf("latest.yml"), true);
  assert.equal(plan.artifacts.includes("latest.yml"), false);
  assert.equal(plan.manifest, "latest.yml");
});

test("readPackageIdentity fails when lockfile versions drift", () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "package.json", JSON.stringify({ name: "echo-craft", version: "2.0.5" }));
    writeFile(
      dir,
      "package-lock.json",
      JSON.stringify({ name: "echo-craft", version: "2.0.6", packages: { "": { version: "2.0.6" } } })
    );
    assert.throws(() => readPackageIdentity(dir), /does not match package-lock.json/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("requireReleaseCredentials fails closed for missing secrets", () => {
  assert.throws(() => requireReleaseCredentials("linux", {}), /NC_PASSWORD/);
  assert.throws(
    () => requireReleaseCredentials("win", { NC_PASSWORD: "x" }),
    /CSC_LINK/
  );
  assert.throws(
    () => requireReleaseCredentials("win", { NC_PASSWORD: "x", CSC_LINK: "cert.p12" }),
    /CSC_KEY_PASSWORD/
  );
  assert.throws(
    () => requireReleaseCredentials("mac", { NC_PASSWORD: "x" }),
    /APPLE_/
  );
  assert.doesNotThrow(() =>
    requireReleaseCredentials("linux", { NC_PASSWORD: "secret" })
  );
  assert.doesNotThrow(() =>
    requireReleaseCredentials("win", {
      NC_PASSWORD: "secret",
      CSC_LINK: "cert.p12",
      CSC_KEY_PASSWORD: "pw",
    })
  );
  assert.doesNotThrow(() =>
    requireReleaseCredentials("mac", {
      NC_PASSWORD: "secret",
      APPLE_ID: "dev@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "aaaa-bbbb-cccc-dddd",
    })
  );
});

test("parseEnvFile and getUploadConfig read gitignored release env files", () => {
  const parsed = parseEnvFile(`
# comment
NC_URL=https://storage.mantisware.co.za
NC_PASSWORD="s3cret"
`);
  assert.equal(parsed.NC_PASSWORD, "s3cret");
  const config = getUploadConfig({ NC_PASSWORD: "s3cret" });
  assert.equal(config.ncUser, "admin");
  assert.equal(config.remoteFolder, "/Public/echocraft/app");
});

test("prepareBuildEnv drops CSC_LINK on macOS so electron-builder uses the login keychain", () => {
  const source = {
    CSC_LINK: "./certificate.p12",
    WIN_CSC_LINK: "./certificate.p12",
    CSC_KEY_PASSWORD: "pw",
    NC_PASSWORD: "secret",
  };
  const mac = prepareBuildEnv({ id: "mac", skipVersionBump: true }, source);
  assert.equal(mac.CSC_LINK, undefined);
  assert.equal(mac.WIN_CSC_LINK, undefined);
  assert.equal(mac.CSC_KEY_PASSWORD, "pw");
  assert.equal(mac.CSC_IDENTITY_AUTO_DISCOVERY, "true");
  assert.equal(mac.ECHOCRAFT_SKIP_VERSION_BUMP, "1");
  assert.equal(source.CSC_LINK, "./certificate.p12");

  const win = prepareBuildEnv({ id: "win", skipVersionBump: false }, source);
  assert.equal(win.CSC_LINK, "./certificate.p12");
  assert.equal(win.ECHOCRAFT_SKIP_VERSION_BUMP, undefined);
});

test("hasMacSigningIdentity finds the Developer ID on this Mac", { skip: process.platform !== "darwin" }, () => {
  assert.equal(hasMacSigningIdentity(), true);
});

test("electron-builder temp keychain path matches the leftover CSC_LINK keychain", () => {
  const projectRoot = path.resolve(__dirname, "../..");
  const expected = electronBuilderTempKeychainPath(projectRoot, os.tmpdir());
  const digest = crypto.createHash("sha256").update(projectRoot).update("app-builder").digest("hex");
  assert.equal(path.basename(expected), `${digest}.keychain`);
});

test("withoutStaleSigningKeychains drops only the leftover temp keychain", () => {
  const output = parseKeychainSearchList(`
    "/private/var/folders/x/T/deadbeef.keychain"
    "/Users/mantis/Library/Caches/electron-builder/electron-builder-root-certs.keychain"
    "/Users/mantis/Library/Keychains/login.keychain-db"
  `);
  const next = withoutStaleSigningKeychains(output, "/var/folders/x/T/deadbeef.keychain");
  assert.deepEqual(next, [
    "/Users/mantis/Library/Caches/electron-builder/electron-builder-root-certs.keychain",
    "/Users/mantis/Library/Keychains/login.keychain-db",
  ]);
});

test("loadReleaseEnv prefers process env over files", () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, ".env.release", "NC_PASSWORD=file-pass\nNC_USER=file-user\n");
    const loaded = loadReleaseEnv(dir, { NC_PASSWORD: "env-pass" });
    assert.equal(loaded.NC_PASSWORD, "env-pass");
    assert.equal(loaded.NC_USER, "file-user");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUploadEnv reads quoted values from .env.upload and ignores empty process env", () => {
  const dir = makeTempDir();
  try {
    writeFile(
      dir,
      ".env.upload",
      [
        'NC_URL="https://storage.mantisware.co.za"',
        'NC_USER="admin"',
        'NC_PASSWORD="quoted-pass"',
        'REMOTE_FOLDER="/Public/echocraft/app"',
        "",
      ].join("\n")
    );
    const loaded = loadUploadEnv(dir, { NC_PASSWORD: "" });
    const config = requireUploadCredentials(loaded);
    assert.equal(config.ncUrl, "https://storage.mantisware.co.za");
    assert.equal(config.ncUser, "admin");
    assert.equal(config.ncPassword, "quoted-pass");
    assert.equal(config.remoteFolder, "/Public/echocraft/app");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadUploadEnv fails closed when .env.upload is missing", () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => loadUploadEnv(dir, {}), /\.env\.upload/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishPlatform uploads artifacts before the manifest, including dry-run", async () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "EchoCraft-linux-x64.AppImage", "appimage");
    writeFile(dir, "latest-linux.yml", "manifest");
    const order = [];
    const starts = [];
    const progress = [];
    const result = await publishPlatform({
      outputDir: dir,
      plan: {
        artifacts: ["EchoCraft-linux-x64.AppImage"],
        manifest: "latest-linux.yml",
        order: ["EchoCraft-linux-x64.AppImage", "latest-linux.yml"],
      },
      uploadConfig: { ncUrl: "http://127.0.0.1", ncUser: "admin", ncPassword: "x", remoteFolder: "/Public/echocraft/app" },
      dryRun: true,
      onUpload: ({ fileName }) => order.push(fileName),
      onFileStart: (event) => starts.push(event.fileName),
      onProgress: (event) => progress.push(event),
    });
    assert.deepEqual(result.order, ["EchoCraft-linux-x64.AppImage", "latest-linux.yml"]);
    assert.deepEqual(order, ["EchoCraft-linux-x64.AppImage", "latest-linux.yml"]);
    assert.deepEqual(starts, ["EchoCraft-linux-x64.AppImage", "latest-linux.yml"]);
    assert.equal(progress.length, 2);
    assert.equal(progress[0].transferred, progress[0].fileSize);
    assert.equal(progress[0].done, true);
    assert.equal(progress[0].index, 1);
    assert.equal(progress[1].index, 2);
    assert.equal(result.dryRun, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishPlatform rejects a plan that would upload the manifest early", async () => {
  await assert.rejects(
    () =>
      publishPlatform({
        outputDir: ".",
        plan: {
          artifacts: ["latest.yml", "EchoCraft-win32-x64.exe"],
          manifest: "latest.yml",
          order: ["latest.yml", "EchoCraft-win32-x64.exe"],
        },
        uploadConfig: {},
        dryRun: true,
      }),
    /manifest last/
  );
});

test("uploadFile retries and then fails on persistent HTTP errors", async () => {
  let attempts = 0;
  const dir = makeTempDir();
  try {
    const filePath = writeFile(dir, "EchoCraft-win32-x64.exe", "installer");
    const result = await uploadFile(
      filePath,
      {
        ncUrl: "http://127.0.0.1",
        ncUser: "admin",
        ncPassword: "x",
        remoteFolder: "/Public/echocraft/app",
      },
      {
        retries: 2,
        retryDelayMs: 1,
        putRequest: async () => {
          attempts += 1;
          return { statusCode: 500, body: "nope" };
        },
      }
    );
    assert.equal(result.success, false);
    assert.equal(attempts, 3);
    assert.equal(result.statusCode, 500);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishPlatform talks to a local WebDAV mock and keeps manifest last", async () => {
  const dir = makeTempDir();
  const received = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        method: request.method,
        url: request.url,
        bytes: Buffer.concat(chunks).length,
      });
      response.statusCode = 201;
      response.end();
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    writeFile(dir, "EchoCraft-win32-x64.exe", "exe-bytes");
    writeFile(dir, "latest.yml", "version: 2.0.5\n");
    const progress = [];
    const result = await publishPlatform({
      outputDir: dir,
      plan: {
        artifacts: ["EchoCraft-win32-x64.exe"],
        manifest: "latest.yml",
        order: ["EchoCraft-win32-x64.exe", "latest.yml"],
      },
      uploadConfig: {
        ncUrl: `http://127.0.0.1:${port}`,
        ncUser: "admin",
        ncPassword: "pw",
        remoteFolder: "/Public/echocraft/app",
      },
      onProgress: (event) => progress.push(event),
    });
    assert.equal(progress.some((event) => event.fileName === "EchoCraft-win32-x64.exe" && event.transferred === 9), true);
    assert.equal(progress.at(-1).fileName, "latest.yml");
    assert.equal(progress.at(-1).transferred, progress.at(-1).fileSize);
    assert.equal(progress.at(-1).done, true);
    assert.deepEqual(
      received.map((item) => item.url.split("/").pop()),
      ["EchoCraft-win32-x64.exe", "latest.yml"]
    );
    assert.deepEqual(result.order, ["EchoCraft-win32-x64.exe", "latest.yml"]);
    assert.match(
      davFileUrl(
        {
          ncUrl: "https://storage.mantisware.co.za",
          ncUser: "admin",
          remoteFolder: "/Public/echocraft/app",
        },
        "latest.yml"
      ),
      /\/Public\/echocraft\/app\/latest\.yml$/
    );
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
