const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function hasCertificate(pem) {
  return typeof pem === "string" && pem.includes("BEGIN CERTIFICATE");
}

function readLoginAndSystemCertificates() {
  return execFileSync("security", ["find-certificate", "-a", "-p"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

// Node trusts its own CA store, not the macOS keychain. SSL inspection
// (Netskope and similar) puts its CA in the keychain, so curl works and
// Node fails with SELF_SIGNED_CERT_IN_CHAIN. NODE_EXTRA_CA_CERTS is only
// read at process start, so the caller must relaunch with the returned path.
function writeKeychainCaBundle({
  platform = process.platform,
  existing = process.env.NODE_EXTRA_CA_CERTS,
  readCertificates = readLoginAndSystemCertificates,
  dir = os.tmpdir(),
} = {}) {
  if (platform !== "darwin" || existing) return null;

  let pem = "";
  try {
    pem = readCertificates();
  } catch {
    return null;
  }
  if (!hasCertificate(pem)) return null;

  const dest = path.join(dir, "echocraft-keychain-cas.pem");
  fs.writeFileSync(dest, pem);
  return dest;
}

module.exports = { hasCertificate, writeKeychainCaBundle };
