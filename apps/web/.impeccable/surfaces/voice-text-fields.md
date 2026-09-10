# Voice text fields

Mode: Operate. Extend Pulse's existing controls, theme variables, typography, and Lucide icons.

## Direction

The user requested: "Add it everywhere where we can put text we should be able to use voice". Pulse Talq follows the focused editable field across the web client, including Office, Mail, Settings, and dialogs. The Electron client wraps this web UI. React Native mobile retains its separate keyboard dictation behavior; this web control does not establish native mobile Talq support.

## Composition and interaction

- Show one transient trailing microphone for the focused eligible field while capture is idle. Keep the existing composer microphone when present, without adding a duplicate. Disabled, read-only, password, and explicitly excluded fields do not receive the control.
- Reserve at least 48px of inline-end field padding while the microphone is visible, then restore the original inline padding. Keep the field's existing theme and shape. The microphone uses muted text, an accent hover fill, and a visible focus outline.
- Use a 44px by 44px control for coarse pointers. Fine pointers retain the 44px width with a 32px height. Keep positioning within the visual viewport and update it on scrolling and resizing, including viewport changes from the software keyboard.
- Use Pulse's existing Tooltip to show the field label and configured shortcut. The button's accessible name identifies dictation and its target field.
- Portal the microphone into the field's parent element or ShadowRoot, keeping it local to the field's DOM context and dialog focus scope. Retarget on focusin; do not clear the control between focusout and focusin, which would remove a pending Tab destination. Account for transformed dialog containers when positioning the control.
- Capture the field and selection before recording. Shortcut and command palette entry points preserve the intended target. If the field changes, closes, or cannot accept the result, expose the transcript for recovery. Recording has Stop recording and Cancel actions; errors have Dismiss. The capture panel stays in the target dialog when applicable.

## Scope and evidence

The implementation sources are `src/voice/VoiceTextControl.tsx`, `VoiceCaptureHost.tsx`, and `voiceTextTarget.ts`. This change introduces no server or provider protocol changes.

Authorized browser checks used synthetic data. Mail subject and body dictation saved successfully. Shortcut and command palette actions retained the original target; modal dictation worked; editing during capture recovered the transcript. Tab from Mail Subject and modal search reached the microphone. Textarea, contenteditable, and ShadowRoot insertion were exercised. The actual ComposerPromptEditor replaced "world" in "Hello world" with "review" in both its Lexical callback and rendered DOM.

At a 390 by 844px viewport with a coarse pointer, the microphone measured 44px by 44px and the inspected page had no horizontal overflow. The reviewer marked both keyboard and touch findings resolved and returned a ship disposition limited to those fixes. Review screenshots were temporary artifacts, not permanent repository evidence.

These checks do not establish real microphone audio capture, native desktop operation, native mobile operation, or every custom editor's compatibility.
