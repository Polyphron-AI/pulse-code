import type { ReactNode } from "react";

/** Availability copy shared by the environment view and isolated capture. */
export function MeetingRecordingsView({ localTalk }: { readonly localTalk?: ReactNode }) {
  return (
    <section aria-label="Recordings" className="p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Published recordings are not available in this environment.
      </p>
      <div className="text-xs text-muted-foreground">
        {localTalk ?? (
          <p>Local recordings remain on their capture device. Open Pulse Talk on that device.</p>
        )}
      </div>
    </section>
  );
}
