export const ONBOARDING_STAGES = ["Connect", "Agents", "Dictation", "Projects"] as const;
export type WizardStep = "connection" | "agents" | "dictation" | "import";

const STEPS: readonly WizardStep[] = ["connection", "agents", "dictation", "import"];

export function onboardingStepIndex(step: WizardStep): number {
  return STEPS.indexOf(step);
}

export function onboardingStepAt(index: number): WizardStep | null {
  return STEPS[index] ?? null;
}
