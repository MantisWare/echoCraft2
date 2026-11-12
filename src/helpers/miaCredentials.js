// Read-only integration with miaOS's encrypted provider store. Keys stay in
// memory; explicit EchoCraft credentials take precedence over system defaults.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createDecipheriv } = require("crypto");
const { BYOK_API_KEYS } = require("../config/secretKeys");

function selectCredentials(providers, secrets, current = {}) {
  const result = {};
  for (const [name, provider] of Object.entries(providers)) {
    // A key for a custom endpoint must never be sent to a stock cloud endpoint.
    if (provider.base_url) continue;
    const kind = provider.kind || name;
    const target = BYOK_API_KEYS.find((entry) => entry.base === kind);
    const value = secrets[`llm.provider.${name}.api_key`];
    if (target && !current[target.env] && !result[target.env] && typeof value === "string" && value) {
      result[target.env] = value;
    }
  }
  return result;
}

function loadMiaCredentials() {
  const directory = path.join(os.homedir(), ".mia");
  const Database = require("better-sqlite3");
  let db;
  try {
    db = new Database(path.join(directory, "mia.db"), { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("llm.providers");
    const providers = JSON.parse(row?.value || "{}");
    const key = Buffer.from(fs.readFileSync(path.join(directory, ".secrets.key"), "utf8").trim(), "hex");
    const encrypted = fs.readFileSync(path.join(directory, ".secrets.enc"));
    const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]);
    const credentials = selectCredentials(providers, JSON.parse(plaintext.toString("utf8")), process.env);
    Object.assign(process.env, credentials);
    // Return names only: callers must never log key material.
    return Object.keys(credentials);
  } finally {
    db?.close();
  }
}
module.exports = { selectCredentials, loadMiaCredentials };
