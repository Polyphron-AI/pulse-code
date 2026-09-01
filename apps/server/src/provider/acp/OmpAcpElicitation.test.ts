import { describe, expect, it } from "vite-plus/test";
import type * as EffectAcpSchema from "effect-acp/schema";

import { mapOmpAcpElicitationForm } from "./OmpAcpElicitation.ts";

function form(
  properties: NonNullable<
    Extract<EffectAcpSchema.ElicitationRequest, { mode: "form" }>["requestedSchema"]["properties"]
  >,
  required?: ReadonlyArray<string>,
): Extract<EffectAcpSchema.ElicitationRequest, { mode: "form" }> {
  return {
    mode: "form",
    sessionId: "session-1",
    message: "Answer the question",
    requestedSchema: { type: "object", properties, ...(required ? { required } : {}) },
  };
}

describe("mapOmpAcpElicitationForm", () => {
  it("preserves the exact OMP plan approval and refinement values", () => {
    const mapped = mapOmpAcpElicitationForm(
      form(
        {
          value: {
            type: "string",
            title: "Plan approval",
            enum: ["Approve and execute", "Refine plan"],
          },
        },
        ["value"],
      ),
    );

    expect(mapped?.questions).toEqual([
      {
        id: "value",
        header: "Plan approval",
        question: "Answer the question",
        multiSelect: false,
        options: [
          { label: "Approve and execute", description: "Approve and execute" },
          { label: "Refine plan", description: "Refine plan" },
        ],
      },
    ]);
    expect(mapped?.resolve({ value: "Approve and execute" })).toEqual({
      action: { action: "accept", content: { value: "Approve and execute" } },
    });
    expect(mapped?.resolve({ value: "Refine plan" })).toEqual({
      action: { action: "accept", content: { value: "Refine plan" } },
    });
    expect(mapped?.resolve({ value: "approve" })).toEqual({ action: { action: "cancel" } });
    expect(mapped?.resolve({ value: "approve and execute" })).toEqual({
      action: { action: "cancel" },
    });
    expect(mapped?.resolve({})).toEqual({ action: { action: "cancel" } });
  });

  it("groups OMP select and free-text companion fields", () => {
    const mapped = mapOmpAcpElicitationForm(
      form({
        q0: {
          type: "string",
          title: "Target",
          description: "Choose a target",
          oneOf: [
            { const: "web", title: "Web" },
            { const: "mobile", title: "Mobile" },
          ],
        },
        q0__other: { type: "string", title: "Other target" },
      }),
    );

    expect(mapped?.questions).toHaveLength(1);
    expect(mapped?.questions[0]?.options.map((option) => option.label)).toEqual(["Web", "Mobile"]);
    expect(mapped?.resolve({ q0: "Web" })).toEqual({
      action: { action: "accept", content: { q0: "web" } },
    });
    expect(mapped?.resolve({ q0: "Desktop app" })).toEqual({
      action: { action: "accept", content: { q0__other: "Desktop app" } },
    });
  });

  it("maps multi-select values and an optional custom value", () => {
    const mapped = mapOmpAcpElicitationForm(
      form({
        q1: {
          type: "array",
          title: "Surfaces",
          items: { type: "string", enum: ["web", "mobile"] },
        },
        q1__other: { type: "string" },
      }),
    );

    expect(mapped?.questions[0]?.multiSelect).toBe(true);
    expect(mapped?.resolve({ q1: ["web", "desktop"] })).toEqual({
      action: {
        action: "accept",
        content: { q1: ["web"], q1__other: "desktop" },
      },
    });
  });

  it("does not group a non-string other companion", () => {
    const mapped = mapOmpAcpElicitationForm(
      form({
        q0: { type: "string", enum: ["Web"] },
        q0__other: { type: "boolean", title: "Malformed other" },
      }),
    );

    expect(mapped?.questions.map((question) => question.id)).toEqual(["q0", "q0__other"]);
    expect(mapped?.resolve({ q0: "Desktop", q0__other: "Yes" })).toEqual({
      action: { action: "cancel" },
    });
  });

  it("handles free text, booleans, numbers, and integers", () => {
    const mapped = mapOmpAcpElicitationForm(
      form(
        {
          q0__other: { type: "string", minLength: 2 },
          enabled: { type: "boolean", description: "Enable it?" },
          ratio: { type: "number", minimum: 0, maximum: 1 },
          count: { type: "integer", minimum: 1 },
        },
        ["q0__other", "enabled", "ratio", "count"],
      ),
    );

    expect(mapped?.questions.map((question) => question.id)).toEqual([
      "q0__other",
      "enabled",
      "ratio",
      "count",
    ]);
    expect(
      mapped?.resolve({ q0__other: "notes", enabled: "No", ratio: "0.5", count: "2" }),
    ).toEqual({
      action: {
        action: "accept",
        content: { q0__other: "notes", enabled: false, ratio: 0.5, count: 2 },
      },
    });
    expect(mapped?.resolve({ q0__other: "x", enabled: "maybe", ratio: "2", count: "1.5" })).toEqual(
      { action: { action: "cancel" } },
    );
  });
});
