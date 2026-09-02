import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../features/settings/appearance/AppearancePreferencesProvider", () => ({
  useAppearancePreferences: () => ({ themeAppearance: "light" }),
}));

vi.mock("react-native-svg", () => ({
  Path: "path",
  Rect: "rect",
  Svg: "svg",
}));

import { ProviderIcon } from "./ProviderIcon";

describe("ProviderIcon", () => {
  it("uses the Pi glyph for Oh My Pi", () => {
    const icon = ProviderIcon({ provider: "omp", size: 20 }) as ReactElement<{
      readonly viewBox: string;
      readonly width: number;
      readonly height: number;
    }>;

    expect(icon.props).toMatchObject({
      viewBox: "0 0 800 800",
      width: 20,
      height: 20,
    });
  });
});
