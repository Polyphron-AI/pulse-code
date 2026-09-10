import type { AudioCapture } from "./VoiceController";

export async function recordAudio(onLimit: () => void): Promise<AudioCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Microphone capture requires HTTPS, localhost, or the desktop app.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout>;
  let cancelled = false;
  const release = () => {
    clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
  };
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => {
      release();
      reject(new Error("Microphone recording failed."));
    });
    recorder.addEventListener("stop", () => {
      release();
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    });
  });
  void stopped.catch(() => undefined);
  try {
    recorder.start(1000);
  } catch (error) {
    release();
    throw error;
  }
  timer = setTimeout(onLimit, 120_000);
  return {
    cancel: () => {
      cancelled = true;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
    finish: async () => {
      if (recorder.state !== "inactive") recorder.stop();
      const blob = await stopped;
      if (cancelled) throw new Error("Recording cancelled.");
      const context = new AudioContext({ sampleRate: 16000 });
      try {
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        const pcm = new Float32Array(audio.length);
        for (let channel = 0; channel < audio.numberOfChannels; channel++) {
          const samples = audio.getChannelData(channel);
          for (let index = 0; index < pcm.length; index++)
            pcm[index] = pcm[index]! + samples[index]! / audio.numberOfChannels;
        }
        return pcm;
      } finally {
        await context.close();
      }
    },
  };
}
