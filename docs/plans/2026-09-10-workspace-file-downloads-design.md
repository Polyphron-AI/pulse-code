# Workspace file downloads

File links need to deliver the original bytes from the thread's environment to
the device viewing the thread. Text readers cannot handle Excel and other binary
formats.

Extend workspace asset requests with an optional download flag. Download URLs
authorize one exact file, preserve existing workspace and symlink checks, expire
after one hour, and stream an attachment response over HTTP. Preview URLs retain
their existing extension restrictions. File bytes do not pass through WebSocket
messages or get buffered in the web renderer.

Desktop uses a download IPC action and Electron's download manager, saving into
Downloads with collision suffixes. Web uses the browser's download handling.
Mobile downloads into cache and opens the native save/share sheet, where the user
chooses where to keep the file. File links and file viewers expose Download file;
known binary formats bypass the text reader. Unrecognized binary files retain a
clear explanation and access to the download action.

Verify exact-file authorization, expiry, response headers, byte preservation,
desktop filename collisions, native sharing, and focused client typechecks.
