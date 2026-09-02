import { describe, expect, it } from "vite-plus/test";

import { mergeProviderInstanceEnvironment } from "./ProviderInstanceEnvironment.ts";

describe("mergeProviderInstanceEnvironment", () => {
  it("overrides inherited environment values and preserves empty strings", () => {
    expect(
      mergeProviderInstanceEnvironment(
        [
          { name: "OPENROUTER_API_KEY", value: "sk-or-test", sensitive: true },
          { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
        ],
        "linux",
        { ANTHROPIC_API_KEY: "inherited", PATH: "/bin" },
      ),
    ).toMatchObject({
      OPENROUTER_API_KEY: "sk-or-test",
      ANTHROPIC_API_KEY: "",
      PATH: "/bin",
    });
  });

  it("removes ambient casing variants before applying Windows overrides", () => {
    const merged = mergeProviderInstanceEnvironment(
      [
        { name: "pAtH", value: "selected-path", sensitive: false },
        { name: "oPeNaI_aPi_KeY", value: "selected-provider-key", sensitive: true },
      ],
      "win32",
      {
        PATH: "ambient-uppercase-path",
        Path: "ambient-title-path",
        OPENAI_API_KEY: "ambient-provider-key",
        Ordinary_Value: "preserved",
      },
    );

    expect(Object.keys(merged).filter((key) => key.toUpperCase() === "PATH")).toEqual(["pAtH"]);
    expect(Object.keys(merged).filter((key) => key.toUpperCase() === "OPENAI_API_KEY")).toEqual([
      "oPeNaI_aPi_KeY",
    ]);
    expect(merged).toMatchObject({
      pAtH: "selected-path",
      oPeNaI_aPi_KeY: "selected-provider-key",
      Ordinary_Value: "preserved",
    });
  });
});
