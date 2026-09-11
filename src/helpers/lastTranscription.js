/**
 * Picks the newest completed transcription that has copyable text.
 * Failed, pending, and discarded rows are skipped so the clipboard never
 * receives an error placeholder or an in-flight draft.
 */
function selectLastCopyableTranscriptionText(rows) {
  if (Array.isArray(rows) === false) return null;

  for (const row of rows) {
    if (row === null || row === undefined) continue;
    if (row.status === "failed" || row.status === "pending" || row.status === "discarded") {
      continue;
    }
    if (typeof row.text !== "string") continue;
    const text = row.text.trim();
    if (text === "") continue;
    return text;
  }

  return null;
}

async function copyLastTranscription({ getTranscriptions, writeClipboard }) {
  if (typeof getTranscriptions !== "function" || typeof writeClipboard !== "function") {
    return { success: false, copied: false };
  }

  try {
    const rows = await getTranscriptions(20);
    const text = selectLastCopyableTranscriptionText(rows);
    if (text === null) {
      return { success: true, copied: false };
    }
    await writeClipboard(text);
    return { success: true, copied: true };
  } catch {
    return { success: false, copied: false };
  }
}

module.exports = {
  selectLastCopyableTranscriptionText,
  copyLastTranscription,
};
