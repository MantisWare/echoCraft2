const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === "./debugLogger") return { error() {}, info() {} };
  if (name === "./windowBroadcast") return { broadcastToWindows() {} };
  return load.call(this, name, ...args);
};
const CliBridge = require("../../src/helpers/cliBridge");
Module._load = load;

test("wake audio stays local, returns text, rejects invalid payload and busy recording", async () => {
  const windowManager = { _dictationLifecycleState: "idle" };
  let calls = 0;
  const bridge = new CliBridge({
    windowManager,
    whisperManager: {
      async transcribeLocalWhisper(audio, options) {
        calls++;
        assert.equal(audio.toString(), "audio");
        assert.equal(options.model, process.env.LOCAL_WHISPER_MODEL || "small");
        assert.equal(options.initialPrompt, "Mia Nebula.");
        return { success: true, text: "Mia Nebula." };
      },
    },
  });
  const route = bridge._matchRoute("POST", "/v1/audio/transcribe");
  const body = { audio: Buffer.from("audio").toString("base64"), prompt: "Mia Nebula." };
  assert.equal((await route.handler({ body })).data.text, "Mia Nebula.");
  assert.equal(bridge.transcribing, false);
  await assert.rejects(route.handler({ body: { audio: "not base64!" } }), { code: "VALIDATION" });
  windowManager._dictationLifecycleState = "recording";
  await assert.rejects(route.handler({ body }), { code: "BUSY" });
  assert.equal(calls, 1);
});

test("bridge resets busy state after recognizer failure", async () => {
  const bridge = new CliBridge({
    windowManager: { _dictationLifecycleState: "idle" },
    whisperManager: {
      async transcribeLocalWhisper() {
        throw new Error("missing model");
      },
    },
  });
  const route = bridge._matchRoute("POST", "/v1/audio/transcribe");
  await assert.rejects(route.handler({ body: { audio: "YQ==" } }), /missing model/);
  assert.equal(bridge.transcribing, false);
});

test("recording commands are allowlisted and gated until setup is ready", async () => {
  const commands = [];
  const windowManager = {
    _onboardingActive: false,
    sendStartDictation() {
      commands.push("start");
    },
    sendStopDictation() {
      commands.push("stop");
    },
  };
  const bridge = new CliBridge({ windowManager });
  const route = bridge._matchRoute("POST", "/v1/dictation/control");
  route.handler({ body: { command: "start" } });
  route.handler({ body: { command: "stop" } });
  assert.deepEqual(commands, ["start", "stop"]);
  assert.throws(() => route.handler({ body: { command: "constructor" } }), { code: "VALIDATION" });
  windowManager._onboardingActive = true;
  assert.throws(() => route.handler({ body: { command: "start" } }), { code: "BUSY" });
});
