export function appendDictationTranscript(current: string, transcript: string): string {
  const text = transcript.trim();
  if (!text) return current;
  if (!current) return text;
  if (/\s$/.test(current)) return `${current}${text}`;
  return `${current} ${text}`;
}

export function dictationFileName(audio: Blob): string {
  if (audio.type.includes("mp4")) return "dictation.mp4";
  if (audio.type.includes("ogg")) return "dictation.ogg";
  return "dictation.webm";
}
