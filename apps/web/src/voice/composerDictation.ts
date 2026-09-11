export function dictationSendDisabledReason(busy: boolean, reason: string | null) {
  return busy ? "Finish dictation before sending." : reason;
}

export function dictationInsertion(prompt: string, transcript: string) {
  return {
    start: prompt.length,
    end: prompt.length,
    text: `${prompt.length && !/\s$/.test(prompt) ? " " : ""}${transcript}`,
  };
}
