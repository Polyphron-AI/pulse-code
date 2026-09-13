import { describe, expect, it } from "vite-plus/test";

import {
  ONBOARDING_STAGES,
  onboardingStepAt,
  onboardingStepIndex,
  type WizardStep,
} from "./welcomeWizard.logic";

describe("welcome wizard navigation", () => {
  it("maps every visible stage to its step and back", () => {
    const steps: readonly WizardStep[] = ["connection", "agents", "dictation", "import"];
    expect(ONBOARDING_STAGES).toHaveLength(steps.length);
    steps.forEach((step, index) => {
      expect(onboardingStepIndex(step)).toBe(index);
      expect(onboardingStepAt(index)).toBe(step);
    });
  });

  it("rejects indexes outside the wizard", () => {
    expect(onboardingStepAt(-1)).toBeNull();
    expect(onboardingStepAt(4)).toBeNull();
  });
});
