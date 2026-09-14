import { assert, describe, it } from "@effect/vitest";

import { isPulseNextVersion } from "./bundled-parakeet.ts";

describe("isPulseNextVersion", () => {
  it("limits bundled model payloads to Pulse Next releases", () => {
    assert.isTrue(isPulseNextVersion("0.0.41-pulse.10"));
    assert.isFalse(isPulseNextVersion("0.0.41"));
    assert.isFalse(isPulseNextVersion("0.0.41-nightly.20260914.1"));
  });
});
