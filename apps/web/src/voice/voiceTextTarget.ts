export type VoiceTextField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function focusedVoiceElement() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

const textTypes = new Set(["text", "search", "email", "url", "tel", "number"]);
export function voiceInsertion(
  text: string,
  before: string,
  after: string,
  separateWords: boolean,
) {
  if (!separateWords) return text;
  const word = /[\p{L}\p{N}]/u;
  const leading = word.test(before.slice(-1)) && word.test(text.slice(0, 1)) ? " " : "";
  const trailing = word.test(text.slice(-1)) && word.test(after.slice(0, 1)) ? " " : "";
  return leading + text + trailing;
}
const excluded =
  '[data-voice-control], [data-voice-disabled], [data-voice-shortcut-capture], [data-keybinding-capture], [inert], [aria-disabled="true"], [aria-readonly="true"]';

/** Native fields and editor roots share the same focus and delivery rules. */
export function voiceTextField(value: EventTarget | null): VoiceTextField | null {
  if (!(value instanceof HTMLElement) || value.closest(excluded)) return null;
  if (value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement) {
    if (value.disabled || value.readOnly || value.matches(":disabled")) return null;
    return value instanceof HTMLInputElement && !textTypes.has(value.type) ? null : value;
  }
  if (!value.isContentEditable) return null;
  let root = value;
  while (root.parentElement?.isContentEditable) root = root.parentElement;
  return root;
}

export function voiceFieldLabel(field: VoiceTextField) {
  const labelledBy = field.getAttribute("aria-labelledby");
  const label =
    field.getAttribute("aria-label") ||
    labelledBy
      ?.split(/\s+/)
      .map((id) => field.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ") ||
    ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
      field.labels?.[0]?.textContent) ||
    field.getAttribute("placeholder") ||
    field.getAttribute("aria-placeholder") ||
    "text field";
  return label.trim().slice(0, 80);
}

function available(field: VoiceTextField) {
  return (
    field.isConnected &&
    voiceTextField(field) === field &&
    field.getClientRects().length > 0 &&
    !field.closest('[hidden], [aria-hidden="true"]')
  );
}

/** Snapshot before recording so later focus or typing cannot redirect/overwrite speech. */
export function captureVoiceTextTarget(field: VoiceTextField): (text: string) => void {
  const location = field.ownerDocument.location.href;
  const fail = () => {
    throw new Error("The text field changed or closed. Copy your transcript below.");
  };
  const validate = () => {
    if (!available(field) || field.ownerDocument.location.href !== location) fail();
  };
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const original = field.value;
    const start = field.selectionStart ?? original.length;
    const end = field.selectionEnd ?? start;
    return (text) => {
      validate();
      if (field.value !== original) fail();
      text = voiceInsertion(
        text,
        original.slice(0, start),
        original.slice(end),
        start === end &&
          (!(field instanceof HTMLInputElement) || ["text", "search"].includes(field.type)),
      );
      const value = original.slice(0, start) + text + original.slice(end);
      if (field.maxLength >= 0 && value.length > field.maxLength)
        throw new Error(
          "The transcript exceeds this field's character limit. Copy and shorten it below.",
        );
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        composed: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      });
      if (!field.dispatchEvent(event)) fail();
      field.focus({ preventScroll: true });
      if (field.selectionStart !== null) {
        field.setSelectionRange(start, end);
        if (field.ownerDocument.execCommand("insertText", false, text)) return;
      }
      // Call the native setter so React's value tracker sees the subsequent input event.
      const prototype =
        field instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      if (field.value !== value) {
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, original);
        throw new Error("This field cannot accept the transcript. Copy it below.");
      }
      field.focus({ preventScroll: true });
      if (field.selectionStart !== null)
        field.setSelectionRange(start + text.length, start + text.length);
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: text,
        }),
      );
    };
  }
  const original = field.innerHTML;
  const selection = field.ownerDocument.getSelection();
  const root = field.getRootNode();
  const composed =
    root instanceof ShadowRoot ? selection?.getComposedRanges?.({ shadowRoots: [root] })[0] : null;
  let range: Range | null = null;
  if (
    composed &&
    field.contains(composed.startContainer) &&
    field.contains(composed.endContainer)
  ) {
    range = field.ownerDocument.createRange();
    range.setStart(composed.startContainer, composed.startOffset);
    range.setEnd(composed.endContainer, composed.endOffset);
  } else if (
    selection?.rangeCount &&
    field.contains(selection.getRangeAt(0).commonAncestorContainer)
  ) {
    range = selection.getRangeAt(0).cloneRange();
  }
  return (text) => {
    validate();
    if (field.innerHTML !== original || !range || !field.contains(range.commonAncestorContainer))
      fail();
    if (range!.collapsed) {
      const before = range!.cloneRange();
      before.selectNodeContents(field);
      before.setEnd(range!.startContainer, range!.startOffset);
      const after = range!.cloneRange();
      after.selectNodeContents(field);
      after.setStart(range!.endContainer, range!.endOffset);
      text = voiceInsertion(text, before.toString(), after.toString(), true);
    }
    field.focus({ preventScroll: true });
    const current = field.ownerDocument.getSelection();
    current?.removeAllRanges();
    current?.addRange(range!);
    // Browser editing preserves editor input handlers and native undo history.
    if (!field.ownerDocument.execCommand("insertText", false, text))
      throw new Error("This editor could not insert the transcript. Copy it below.");
  };
}

let activeField: VoiceTextField | null = null;
export function rememberVoiceTextField(field: VoiceTextField | null) {
  activeField = field;
}
export function currentVoiceTextField() {
  return activeField && available(activeField) ? activeField : null;
}
