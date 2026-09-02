import { assert, describe, it } from "@effect/vitest";

import {
  decodeLatestRelease,
  resolveReleaseCheck,
  upstreamReleaseSources,
} from "./check-upstream-releases.ts";

describe("upstream release sources", () => {
  it("links the official OMP and Orca repositories to their Polyphron-AI forks", () => {
    assert.deepStrictEqual(
      upstreamReleaseSources.map((source) => ({
        id: source.id,
        upstreamRepository: source.upstreamRepository,
        forkRepository: source.forkRepository,
        integrationMode: source.integrationMode,
      })),
      [
        {
          id: "omp",
          upstreamRepository: "can1357/oh-my-pi",
          forkRepository: "Polyphron-AI/oh-my-pi",
          integrationMode: "provider",
        },
        {
          id: "orca",
          upstreamRepository: "stablyai/orca",
          forkRepository: "Polyphron-AI/orca",
          integrationMode: "reference",
        },
      ],
    );
  });
});

describe("decodeLatestRelease", () => {
  it("accepts the GitHub latest-release fields used by the checker", () => {
    assert.deepStrictEqual(
      decodeLatestRelease({
        tag_name: "v18.1.2",
        published_at: "2026-09-01T20:25:24Z",
        html_url: "https://github.com/can1357/oh-my-pi/releases/tag/v18.1.2",
      }),
      {
        tag: "v18.1.2",
        publishedAt: "2026-09-01T20:25:24Z",
        url: "https://github.com/can1357/oh-my-pi/releases/tag/v18.1.2",
      },
    );
  });

  it("rejects incomplete GitHub release data", () => {
    assert.throws(
      () => decodeLatestRelease({ tag_name: "v18.1.2" }),
      /GitHub latest-release response is missing required fields\./,
    );
  });
});

describe("resolveReleaseCheck", () => {
  const omp = upstreamReleaseSources[0]!;

  it("reports a linked fork and unchanged release cursor", () => {
    assert.deepStrictEqual(
      resolveReleaseCheck(
        omp,
        {
          tag: "v18.1.3",
          publishedAt: "2026-09-02T14:06:10Z",
          url: "https://github.com/can1357/oh-my-pi/releases/tag/v18.1.3",
        },
        { fork: true, parentRepository: "can1357/oh-my-pi" },
      ),
      {
        id: "omp",
        displayName: "Oh My Pi",
        integrationMode: "provider",
        upstreamRepository: "can1357/oh-my-pi",
        forkRepository: "Polyphron-AI/oh-my-pi",
        observedTag: "v18.1.3",
        latestTag: "v18.1.3",
        publishedAt: "2026-09-02T14:06:10Z",
        releaseUrl: "https://github.com/can1357/oh-my-pi/releases/tag/v18.1.3",
        releaseState: "current",
        forkState: "linked",
        compatibilityState: "unreviewed",
      },
    );
  });

  it("reports release drift and a mismatched fork parent", () => {
    const result = resolveReleaseCheck(
      omp,
      {
        tag: "v18.2.0",
        publishedAt: "2026-09-03T08:00:00Z",
        url: "https://github.com/can1357/oh-my-pi/releases/tag/v18.2.0",
      },
      { fork: true, parentRepository: "someone-else/oh-my-pi" },
    );

    assert.equal(result.releaseState, "update-available");
    assert.equal(result.forkState, "mismatch");
    assert.equal(result.compatibilityState, "unreviewed");
  });
});
