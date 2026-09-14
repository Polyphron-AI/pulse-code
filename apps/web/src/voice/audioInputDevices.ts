const AUDIO_INPUT_KEY = "pulse:dictation-audio-input:v1";
let memoryDeviceId: string | null | undefined;

export type AudioInputChoice = {
  readonly deviceId: string | null;
  readonly label: string;
};

export function readAudioInputDeviceId(): string | null {
  if (memoryDeviceId !== undefined) return memoryDeviceId;
  try {
    memoryDeviceId =
      typeof window === "undefined" ? null : window.localStorage.getItem(AUDIO_INPUT_KEY);
    return memoryDeviceId;
  } catch {
    return null;
  }
}

export function writeAudioInputDeviceId(deviceId: string | null): void {
  memoryDeviceId = deviceId;
  try {
    if (deviceId) window.localStorage.setItem(AUDIO_INPUT_KEY, deviceId);
    else window.localStorage.removeItem(AUDIO_INPUT_KEY);
  } catch {
    // Capture can still use the selection for this attempt when storage is unavailable.
  }
}

export async function listAudioInputChoices(): Promise<readonly AudioInputChoice[]> {
  const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!mediaDevices?.enumerateDevices) return [{ deviceId: null, label: "System default" }];
  let devices: readonly MediaDeviceInfo[];
  try {
    devices = await mediaDevices.enumerateDevices();
  } catch {
    return [{ deviceId: null, label: "System default" }];
  }
  let unnamed = 0;
  return [
    { deviceId: null, label: "System default" },
    ...devices
      .filter((device) => device.kind === "audioinput" && device.deviceId !== "default")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${String(++unnamed)}`,
      })),
  ];
}
