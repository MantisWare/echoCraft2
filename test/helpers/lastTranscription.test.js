const test = require("node:test");
const assert = require("node:assert/strict");
const {
  selectLastCopyableTranscriptionText,
  copyLastTranscription,
} = require("../../src/helpers/lastTranscription");

test("selects the newest completed transcription with text", () => {
  const text = selectLastCopyableTranscriptionText([
    { status: "failed", text: "oops" },
    { status: "completed", text: "  hello world  " },
    { status: "completed", text: "older" },
  ]);
  assert.equal(text, "hello world");
});

test("skips pending, discarded, empty, and non-string rows", () => {
  assert.equal(
    selectLastCopyableTranscriptionText([
      { status: "pending", text: "soon" },
      { status: "discarded", text: "gone" },
      { status: "completed", text: "   " },
      { status: "completed", text: 42 },
      null,
      { status: "completed", text: "kept" },
    ]),
    "kept"
  );
});

test("returns null when nothing is copyable", () => {
  assert.equal(selectLastCopyableTranscriptionText([]), null);
  assert.equal(selectLastCopyableTranscriptionText(null), null);
  assert.equal(
    selectLastCopyableTranscriptionText([{ status: "failed", text: "err" }]),
    null
  );
});

test("copyLastTranscription writes the selected text", async () => {
  const writes = [];
  const result = await copyLastTranscription({
    getTranscriptions: () => [{ status: "completed", text: "latest" }],
    writeClipboard: async (text) => {
      writes.push(text);
    },
  });
  assert.deepEqual(result, { success: true, copied: true });
  assert.deepEqual(writes, ["latest"]);
});

test("copyLastTranscription reports an empty success when history is empty", async () => {
  const result = await copyLastTranscription({
    getTranscriptions: () => [],
    writeClipboard: async () => {
      throw new Error("should not write");
    },
  });
  assert.deepEqual(result, { success: true, copied: false });
});

test("copyLastTranscription reports failure when the write throws", async () => {
  const result = await copyLastTranscription({
    getTranscriptions: () => [{ status: "completed", text: "latest" }],
    writeClipboard: async () => {
      throw new Error("clipboard down");
    },
  });
  assert.deepEqual(result, { success: false, copied: false });
});
