const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAudioManager } = require("./harness/audioManager");

async function loadHarness(t) {
  return loadAudioManager(t, {
    cachePrefix: "openwhispr-transcript-publish-test-",
    settingsKey: "__transcriptPublishSettings",
    settings: {
      useLocalWhisper: true,
      localTranscriptionProvider: "whisper",
      whisperModel: "base",
    },
  });
}

function trackPublishes(createManager) {
  const published = [];
  const manager = createManager({
    _transcriptPublished: false,
    onTranscriptionComplete: (result) => published.push(result.text),
  });
  return { manager, published };
}

// The batch and streaming finalizers hold independent cancellation counters, so
// a stream settling next to a batch decode used to publish two different
// transcripts of the same audio — and the renderer pasted both.
test("one dictation publishes one transcript even when both finalizers settle", async (t) => {
  const { createManager } = await loadHarness(t);
  const { manager, published } = trackPublishes(createManager);

  assert.equal(
    manager._publishTranscriptionResult({ success: true, text: "streamed decode" }),
    true
  );
  assert.equal(manager._publishTranscriptionResult({ success: true, text: "batch decode" }), false);

  assert.deepEqual(published, ["streamed decode"]);
});

// An empty outcome only drives the "no audio" surface. Latching on it would let
// a silence verdict swallow the transcript that arrives behind it.
test("an empty outcome never latches, so a real transcript still gets through", async (t) => {
  const { createManager } = await loadHarness(t);
  const { manager, published } = trackPublishes(createManager);

  manager._publishTranscriptionResult({ success: true, text: "" });
  manager._publishTranscriptionResult({ success: true, text: "   " });
  manager._publishTranscriptionResult({ success: true, text: "real transcript" });

  assert.deepEqual(published, ["", "   ", "real transcript"]);
});

test("the latch reopens for the next dictation", async (t) => {
  const { createManager } = await loadHarness(t);
  const { manager, published } = trackPublishes(createManager);

  manager._publishTranscriptionResult({ success: true, text: "first dictation" });
  // Both startRecording and startStreamingRecording clear the latch this way.
  manager._transcriptPublished = false;
  manager._publishTranscriptionResult({ success: true, text: "second dictation" });

  assert.deepEqual(published, ["first dictation", "second dictation"]);
});
