const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  getFtpConfig,
  requireFtpCredentials,
  listWebsiteFiles,
  WEBSITE_PUBLIC_BASE,
} = require("../../scripts/release/website");
const {
  publishWebsite,
  remoteDirFor,
  enterRemoteDir,
} = require("../../scripts/release/websitePublisher");
const { resolveUploadWork } = require("../../scripts/upload.js");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "echocraft-website-"));
}

function writeFile(dir, name, contents = "x") {
  const filePath = path.join(dir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

test("remoteDirFor stays relative so FTP never CWD to /", () => {
  assert.equal(remoteDirFor("/echoCraft", "app-icon.svg"), "echoCraft");
  assert.equal(remoteDirFor("echoCraft", "fonts/noto-sans.css"), "echoCraft/fonts");
  assert.equal(remoteDirFor("/", "index.html"), null);
});

test("enterRemoteDir descends one segment at a time and never cds to parent of echoCraft", async () => {
  const cds = [];
  const ensured = [];
  const client = {
    async cd(dir) {
      cds.push(dir);
    },
    async ensureDir(dir) {
      ensured.push(dir);
    },
  };

  let current = await enterRemoteDir(client, "echoCraft", null);
  current = await enterRemoteDir(client, "echoCraft/fonts", current);
  current = await enterRemoteDir(client, "echoCraft", current);

  assert.equal(current, "echoCraft");
  assert.deepEqual(ensured, ["echoCraft", "fonts"]);
  assert.deepEqual(cds, [".."]);
});

test("getFtpConfig prefers FTP_* over SFTP_* and defaults to echoCraft", () => {
  const config = getFtpConfig({
    SFTP_HOST: "legacy.example",
    SFTP_PORT: "2121",
    SFTP_USER: "sftp-user",
    SFTP_PASSWORD: "sftp-pass",
    SFTP_PATH: "/legacy",
    FTP_HOST: "mantisware.co.za",
    FTP_PORT: "21",
    FTP_USER: "vibe",
    FTP_PASSWORD: "ftp-pass",
    FTP_PATH: "/echoCraft",
  });
  assert.equal(config.host, "mantisware.co.za");
  assert.equal(config.port, 21);
  assert.equal(config.user, "vibe");
  assert.equal(config.password, "ftp-pass");
  assert.equal(config.remotePath, "/echoCraft");
  assert.equal(config.secure, false);
});

test("getFtpConfig accepts SFTP_* aliases when FTP_* is absent", () => {
  const config = getFtpConfig({
    SFTP_HOST: "mantisware.co.za",
    SFTP_PORT: "21",
    SFTP_USER: "vibe",
    SFTP_PASSWORD: "sftp-pass",
    SFTP_PATH: "/echoCraft",
  });
  assert.equal(config.host, "mantisware.co.za");
  assert.equal(config.port, 21);
  assert.equal(config.user, "vibe");
  assert.equal(config.password, "sftp-pass");
  assert.equal(config.remotePath, "/echoCraft");
});

test("getFtpConfig defaults host, port, and remote path", () => {
  const config = getFtpConfig({});
  assert.equal(config.host, "mantisware.co.za");
  assert.equal(config.port, 21);
  assert.equal(config.remotePath, "/echoCraft");
  assert.equal(config.user, "");
  assert.equal(config.password, "");
  assert.equal(WEBSITE_PUBLIC_BASE, "https://www.mantisware.co.za/echoCraft/");
});

test("requireFtpCredentials fails closed when user or password is missing", () => {
  assert.throws(
    () => requireFtpCredentials(getFtpConfig({ SFTP_USER: "vibe" })),
    /SFTP_PASSWORD|FTP_PASSWORD/
  );
  assert.throws(
    () => requireFtpCredentials(getFtpConfig({ SFTP_PASSWORD: "x" })),
    /SFTP_USER|FTP_USER/
  );
  assert.doesNotThrow(() =>
    requireFtpCredentials(
      getFtpConfig({ SFTP_USER: "vibe", SFTP_PASSWORD: "x", SFTP_PATH: "/echoCraft" })
    )
  );
});

test("requireFtpCredentials rejects an invalid port", () => {
  assert.throws(
    () =>
      requireFtpCredentials(
        getFtpConfig({
          SFTP_USER: "vibe",
          SFTP_PASSWORD: "x",
          SFTP_PORT: "nope",
        })
      ),
    /FTP_PORT/
  );
});

test("listWebsiteFiles uploads public assets and skips docs and junk", () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "index.html");
    writeFile(dir, "privacy-policy.html");
    writeFile(dir, "terms-of-service.html");
    writeFile(dir, "styles.css");
    writeFile(dir, "app-icon.svg");
    writeFile(dir, "fonts/NotoSans-normal-latin.woff2");
    writeFile(dir, "README.md");
    writeFile(dir, "SUMMARY.md");
    writeFile(dir, ".DS_Store");
    writeFile(dir, "notes.txt");

    assert.deepEqual(listWebsiteFiles(dir), [
      "app-icon.svg",
      "fonts/NotoSans-normal-latin.woff2",
      "index.html",
      "privacy-policy.html",
      "styles.css",
      "terms-of-service.html",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("docs/webpage contains the v2 marketing pages", () => {
  const websiteDir = path.resolve(__dirname, "../../docs/webpage");
  const files = listWebsiteFiles(websiteDir);
  for (const required of [
    "index.html",
    "privacy-policy.html",
    "terms-of-service.html",
    "styles.css",
    "app-icon.svg",
    "fonts/noto-sans.css",
    "fonts/NotoSans-normal-latin.woff2",
  ]) {
    assert.ok(files.includes(required), `missing ${required}`);
  }
  assert.ok(!files.includes("README.md"));
});

test("listWebsiteFiles fails when the webpage folder is missing or empty", () => {
  const dir = makeTempDir();
  try {
    assert.throws(() => listWebsiteFiles(path.join(dir, "missing")), /docs\/webpage/);
    assert.throws(() => listWebsiteFiles(dir), /no deployable website files/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveUploadWork allows website-only and fails when both are empty", () => {
  assert.throws(
    () => resolveUploadWork({ platforms: [], websiteFiles: [] }),
    /nothing to upload/
  );
  assert.deepEqual(
    resolveUploadWork({
      platforms: [],
      websiteFiles: ["index.html"],
    }),
    { platforms: [], websiteFiles: ["index.html"] }
  );
  const platforms = [{ id: "mac", status: "ready" }];
  assert.deepEqual(resolveUploadWork({ platforms, websiteFiles: ["index.html"] }), {
    platforms,
    websiteFiles: ["index.html"],
  });
});

function createMockFtp({ remoteSizes = {}, uploadError = null } = {}) {
  const uploaded = [];
  const ensured = [];
  return {
    uploaded,
    ensured,
    accessCalls: 0,
    closed: false,
    async access() {
      this.accessCalls += 1;
    },
    async close() {
      this.closed = true;
    },
    async cd() {},
    async ensureDir(dir) {
      ensured.push(dir);
    },
    async size(remoteName) {
      if (remoteSizes[remoteName] === undefined) {
        throw new Error("550 not found");
      }
      return remoteSizes[remoteName];
    },
    async uploadFrom(localPath, remoteName) {
      if (uploadError) {
        throw new Error(uploadError);
      }
      uploaded.push({ localPath, remoteName });
      remoteSizes[remoteName] = fs.statSync(localPath).size;
    },
  };
}

test("publishWebsite dry-run lists files and does not connect", async () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "index.html", "<html></html>");
    const client = createMockFtp();
    const result = await publishWebsite({
      websiteDir: dir,
      files: ["index.html"],
      ftpConfig: getFtpConfig({ SFTP_USER: "vibe", SFTP_PASSWORD: "x" }),
      dryRun: true,
      createClient: () => client,
    });
    assert.deepEqual(result.uploaded, ["index.html"]);
    assert.deepEqual(result.skipped, ["index.html"]);
    assert.equal(client.accessCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishWebsite skips unchanged files and uploads new ones", async () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "index.html", "<html>one</html>");
    writeFile(dir, "styles.css", "body{}");
    writeFile(dir, "fonts/note.woff2", "font");
    const client = createMockFtp({
      remoteSizes: {
        "index.html": Buffer.byteLength("<html>one</html>"),
      },
    });
    const result = await publishWebsite({
      websiteDir: dir,
      files: ["index.html", "styles.css", "fonts/note.woff2"],
      ftpConfig: getFtpConfig({
        SFTP_USER: "vibe",
        SFTP_PASSWORD: "x",
        SFTP_PATH: "/echoCraft",
      }),
      createClient: () => client,
    });
    assert.deepEqual(result.skipped, ["index.html"]);
    assert.deepEqual(result.uploaded, ["styles.css", "fonts/note.woff2"]);
    assert.equal(client.accessCalls, 1);
    assert.equal(client.closed, true);
    assert.ok(client.ensured.includes("echoCraft"));
    assert.ok(client.ensured.includes("fonts"));
    assert.ok(!client.ensured.includes("echoCraft/fonts"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishWebsite fails closed when a transfer is incomplete", async () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "index.html", "<html>oops</html>");
    const client = createMockFtp({ uploadError: "incomplete upload" });
    await assert.rejects(
      () =>
        publishWebsite({
          websiteDir: dir,
          files: ["index.html"],
          ftpConfig: getFtpConfig({ SFTP_USER: "vibe", SFTP_PASSWORD: "x" }),
          createClient: () => client,
          sleep: async () => {},
        }),
      /index\.html/
    );
    assert.equal(client.closed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishWebsite retries a control-socket timeout on a new session", async () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "app-icon.svg", "<svg></svg>");
    let uploads = 0;
    let accessCalls = 0;
    const createClient = () => {
      const client = createMockFtp();
      client.access = async () => {
        accessCalls += 1;
      };
      client.uploadFrom = async (localPath, remoteName) => {
        uploads += 1;
        if (uploads === 1) {
          throw new Error("Timeout (control socket)");
        }
        client.uploaded.push({ localPath, remoteName });
      };
      client.size = async () => {
        if (uploads < 2) {
          throw new Error("550 not found");
        }
        return Buffer.byteLength("<svg></svg>");
      };
      return client;
    };

    const waits = [];
    const result = await publishWebsite({
      websiteDir: dir,
      files: ["app-icon.svg"],
      ftpConfig: getFtpConfig({ SFTP_USER: "vibe", SFTP_PASSWORD: "x" }),
      createClient,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    assert.deepEqual(result.uploaded, ["app-icon.svg"]);
    assert.equal(uploads, 2);
    assert.equal(accessCalls, 2);
    assert.deepEqual(waits, [45_000]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishWebsite finishes later files and retries a timed-out file on a final pass", async () => {
  const dir = makeTempDir();
  try {
    writeFile(dir, "a.html", "aaa");
    writeFile(dir, "b.html", "bbb");
    let aUploads = 0;
    const createClient = () => {
      const client = createMockFtp();
      const originalUpload = client.uploadFrom.bind(client);
      client.uploadFrom = async (localPath, remoteName) => {
        if (remoteName === "a.html") {
          aUploads += 1;
          if (aUploads < 4) {
            throw new Error("Timeout (control socket)");
          }
        }
        return originalUpload(localPath, remoteName);
      };
      return client;
    };

    const result = await publishWebsite({
      websiteDir: dir,
      files: ["a.html", "b.html"],
      ftpConfig: {
        ...getFtpConfig({ SFTP_USER: "vibe", SFTP_PASSWORD: "x" }),
        retries: 3,
        busyBackoffMs: 1,
        finalRetryDelayMs: 1,
      },
      createClient,
      sleep: async () => {},
    });
    assert.deepEqual(result.uploaded, ["b.html", "a.html"]);
    assert.ok(aUploads >= 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
