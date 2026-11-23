const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { hasCertificate, writeKeychainCaBundle } = require("../../scripts/release/macosTls");

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";

test("hasCertificate recognizes a PEM bundle", () => {
  assert.equal(hasCertificate(PEM), true);
  assert.equal(hasCertificate(""), false);
  assert.equal(hasCertificate(null), false);
});

test("writeKeychainCaBundle is a no-op off macOS and when Node already has extra CAs", () => {
  const readCertificates = () => {
    throw new Error("should not read the keychain");
  };
  assert.equal(
    writeKeychainCaBundle({ platform: "linux", readCertificates }),
    null
  );
  assert.equal(
    writeKeychainCaBundle({
      platform: "darwin",
      existing: "/tmp/already.pem",
      readCertificates,
    }),
    null
  );
});

test("writeKeychainCaBundle stores keychain PEM where a relaunched Node can trust it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "echocraft-ca-"));
  const dest = writeKeychainCaBundle({
    platform: "darwin",
    existing: "",
    dir,
    readCertificates: () => PEM,
  });
  assert.equal(dest, path.join(dir, "echocraft-keychain-cas.pem"));
  assert.equal(fs.readFileSync(dest, "utf8"), PEM);
});

test("writeKeychainCaBundle ignores an empty keychain", () => {
  assert.equal(
    writeKeychainCaBundle({
      platform: "darwin",
      existing: "",
      readCertificates: () => "",
    }),
    null
  );
});
