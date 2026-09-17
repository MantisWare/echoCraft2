const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function davFileUrl(uploadConfig, fileName) {
  const folder = uploadConfig.remoteFolder.endsWith("/")
    ? uploadConfig.remoteFolder.slice(0, -1)
    : uploadConfig.remoteFolder;
  return `${uploadConfig.ncUrl}/remote.php/dav/files/${uploadConfig.ncUser}${folder}/${fileName}`;
}

function putFileOnce(filePath, uploadConfig, putRequest = defaultPutRequest, onProgress) {
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);
  return putRequest({
    url: davFileUrl(uploadConfig, fileName),
    filePath,
    fileName,
    fileSize: stats.size,
    username: uploadConfig.ncUser,
    password: uploadConfig.ncPassword,
    onProgress,
  });
}

function defaultPutRequest({ url, filePath, fileSize, username, password, onProgress }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const protocol = parsed.protocol === "https:" ? https : http;
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const request = protocol.request(
      {
        method: "PUT",
        hostname: parsed.hostname,
        port: parsed.port ?? (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Length": fileSize,
          "Content-Type": "application/octet-stream",
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({ statusCode: response.statusCode, body });
        });
      }
    );
    request.on("error", reject);
    let transferred = 0;
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => {
      transferred += chunk.length;
      if (onProgress) onProgress({ transferred, fileSize });
    });
    stream.on("end", () => {
      if (onProgress) onProgress({ transferred, fileSize });
    });
    stream.on("error", reject);
    stream.pipe(request);
  });
}

async function uploadFile(filePath, uploadConfig, options = {}) {
  const {
    retries = MAX_RETRIES,
    retryDelayMs = RETRY_DELAY_MS,
    putRequest = defaultPutRequest,
    onAttempt,
  } = options;
  const fileName = path.basename(filePath);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await delay(retryDelayMs);
    }
    if (onAttempt) onAttempt({ fileName, attempt });

    let result;
    try {
      result = await putFileOnce(filePath, uploadConfig, putRequest, options.onProgress);
    } catch (error) {
      result = { statusCode: 0, error: error.message };
    }

    const ok = result.statusCode === 201 || result.statusCode === 204;
    if (ok) {
      return { success: true, fileName, statusCode: result.statusCode, attempts: attempt + 1 };
    }

    if (attempt === retries) {
      return {
        success: false,
        fileName,
        statusCode: result.statusCode,
        error: result.error ?? result.body,
        attempts: attempt + 1,
      };
    }
  }

  return { success: false, fileName };
}

function ensureRemoteFolder(uploadConfig, requestFn = defaultMkcolRequest) {
  const folder = uploadConfig.remoteFolder.endsWith("/")
    ? uploadConfig.remoteFolder.slice(0, -1)
    : uploadConfig.remoteFolder;
  const url = `${uploadConfig.ncUrl}/remote.php/dav/files/${uploadConfig.ncUser}${folder}`;
  return requestFn({
    method: "MKCOL",
    url,
    username: uploadConfig.ncUser,
    password: uploadConfig.ncPassword,
  });
}

function defaultMkcolRequest({ method, url, username, password }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const protocol = parsed.protocol === "https:" ? https : http;
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const request = protocol.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port ?? (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: { Authorization: `Basic ${auth}` },
      },
      (response) => {
        response.resume();
        resolve({ statusCode: response.statusCode });
      }
    );
    request.on("error", reject);
    request.end();
  });
}

async function publishPlatform({
  outputDir,
  plan,
  uploadConfig,
  dryRun = false,
  putRequest,
  onUpload,
  onFileStart,
  onProgress,
}) {
  if (!plan?.artifacts || !plan.manifest) {
    throw new Error("upload plan is missing artifacts or manifest");
  }
  if (plan.order[plan.order.length - 1] !== plan.manifest) {
    throw new Error("upload plan must put the platform manifest last");
  }

  const uploaded = [];
  const skipped = [];

  const enqueue = [...plan.artifacts, plan.manifest];
  const total = enqueue.length;
  for (let index = 0; index < enqueue.length; index += 1) {
    const fileName = enqueue[index];
    const filePath = path.join(outputDir, fileName);
    const fileSize = fs.statSync(filePath).size;
    const ordinal = index + 1;
    if (onFileStart) onFileStart({ fileName, fileSize, index: ordinal, total });

    if (dryRun) {
      skipped.push(fileName);
      uploaded.push(fileName);
      if (onProgress) {
        onProgress({
          fileName,
          fileSize,
          transferred: fileSize,
          index: ordinal,
          total,
          done: true,
        });
      }
      if (onUpload) onUpload({ fileName, dryRun: true });
      continue;
    }

    const result = await uploadFile(filePath, uploadConfig, {
      putRequest,
      onProgress: onProgress
        ? ({ transferred, fileSize: size }) =>
            onProgress({
              fileName,
              fileSize: size ?? fileSize,
              transferred,
              index: ordinal,
              total,
            })
        : undefined,
    });
    if (!result.success) {
      throw new Error(
        `Upload failed for ${fileName} (HTTP ${result.statusCode ?? "unknown"})`
      );
    }
    uploaded.push(fileName);
    if (onProgress) {
      onProgress({
        fileName,
        fileSize,
        transferred: fileSize,
        index: ordinal,
        total,
        done: true,
      });
    }
    if (onUpload) onUpload({ fileName, dryRun: false, result });
  }

  return {
    uploaded,
    skipped: dryRun ? skipped : [],
    order: uploaded,
    dryRun,
  };
}

module.exports = {
  MAX_RETRIES,
  RETRY_DELAY_MS,
  davFileUrl,
  uploadFile,
  publishPlatform,
  ensureRemoteFolder,
  defaultPutRequest,
};
