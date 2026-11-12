const { test } = require("node:test");
const assert = require("node:assert/strict");
const { selectCredentials } = require("../../src/helpers/miaCredentials");
test("inherits supported provider keys without overriding app keys or crossing endpoints", () => {
  assert.deepEqual(selectCredentials({
    primary: { kind: "openai" }, openrouter: {},
    private: { kind: "anthropic", base_url: "https://private.example" },
    unknown: {},
  }, {
    "llm.provider.primary.api_key": "system-openai",
    "llm.provider.openrouter.api_key": "system-router",
    "llm.provider.private.api_key": "private-key",
    "llm.provider.unknown.api_key": "unknown-key",
  }, { OPENAI_API_KEY: "app-key" }), { OPENROUTER_API_KEY: "system-router" });
});
test("ignores absent secrets", () => {
  assert.deepEqual(selectCredentials({ openai: {} }, {}), {});
});
