# Retry a new thread

If a new thread fails while preparing its workspace, correct the reported problem
and send again. On web and desktop, your prompt and workspace choices remain in
the draft. When the server confirms that it removed the failed thread, the next
attempt creates a fresh thread automatically.

On mobile, a pending task keeps its draft and queue position after this failure.
Once the server confirms removal, Pulse saves fresh retry identifiers before
sending or requeueing it. If saving fails, the task stays available and Pulse
shows the storage error so you can retry.
