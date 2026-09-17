const test = require("node:test");
const assert = require("node:assert/strict");

const { MIN_RELEASE_VERSION, nextVersion } = require("../../scripts/bump-version.js");

test("release versions never drop below 2.0.1", () => {
  assert.equal(MIN_RELEASE_VERSION, "2.0.1");
  assert.equal(nextVersion("0.11.12", "patch"), "2.0.1");
  assert.equal(nextVersion("2.0.0", "patch"), "2.0.1");
  assert.equal(nextVersion("1.9.9", "2.0.0"), "2.0.1");
  assert.equal(nextVersion("2.0.6", "patch"), "2.0.7");
  assert.equal(nextVersion("2.0.6", "2.0.1"), "2.0.1");
});
