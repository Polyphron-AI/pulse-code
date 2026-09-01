import type { ProviderUserInputAnswers, UserInputQuestion } from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";

type FormRequest = Extract<EffectAcpSchema.ElicitationRequest, { readonly mode: "form" }>;
type PropertySchema = EffectAcpSchema.ElicitationPropertySchema;
type ElicitationContent = NonNullable<
  Extract<EffectAcpSchema.ElicitationResponse["action"], { readonly action: "accept" }>["content"]
>;

interface SelectOption {
  readonly label: string;
  readonly value: string;
}

interface FormField {
  readonly key: string;
  readonly otherKey?: string;
  readonly schema: PropertySchema;
  readonly required: boolean;
  readonly options: ReadonlyArray<SelectOption>;
  readonly question: UserInputQuestion;
}

export interface OmpMappedElicitationForm {
  readonly questions: ReadonlyArray<UserInputQuestion>;
  readonly resolve: (answers: ProviderUserInputAnswers) => EffectAcpSchema.ElicitationResponse;
}

const cancelResponse = (): EffectAcpSchema.ElicitationResponse => ({
  action: { action: "cancel" },
});

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function selectOptions(schema: PropertySchema): ReadonlyArray<SelectOption> {
  if (schema.type === "string") {
    if (schema.oneOf && schema.oneOf.length > 0) {
      return schema.oneOf.map((option) => ({ label: option.title, value: option.const }));
    }
    return (schema.enum ?? []).map((value) => ({ label: value, value }));
  }
  if (schema.type !== "array") {
    return [];
  }
  if ("enum" in schema.items) {
    return schema.items.enum.map((value) => ({ label: value, value }));
  }
  return schema.items.anyOf.map((option) => ({ label: option.title, value: option.const }));
}

function hasSelectOptions(schema: PropertySchema): boolean {
  return selectOptions(schema).length > 0;
}

function makeQuestion(
  request: FormRequest,
  key: string,
  schema: PropertySchema,
  options: ReadonlyArray<SelectOption>,
): UserInputQuestion {
  const title = nonEmpty(schema.title);
  const description = nonEmpty(schema.description);
  const formTitle = nonEmpty(request.requestedSchema.title);
  return {
    id: key,
    header: title ?? formTitle ?? "Question",
    question: description ?? nonEmpty(request.message) ?? title ?? key,
    multiSelect: schema.type === "array",
    options:
      schema.type === "boolean"
        ? [
            { label: "Yes", description: "Yes" },
            { label: "No", description: "No" },
          ]
        : options.map((option) => ({
            label: option.label,
            description: option.label,
          })),
  };
}

function answerValues(answer: unknown): ReadonlyArray<string> | undefined {
  if (typeof answer === "string") {
    const value = answer.trim();
    return value ? [value] : [];
  }
  if (!Array.isArray(answer)) {
    return undefined;
  }
  const values: Array<string> = [];
  for (const entry of answer) {
    if (typeof entry !== "string") {
      return undefined;
    }
    const value = entry.trim();
    if (value) {
      values.push(value);
    }
  }
  return values;
}

function resolveSelectedValue(
  value: string,
  options: ReadonlyArray<SelectOption>,
): string | undefined {
  return options.find((option) => option.label === value || option.value === value)?.value;
}

function resolveText(
  schema: Extract<PropertySchema, { readonly type: "string" }>,
  answer: unknown,
): string | undefined {
  if (typeof answer !== "string") {
    return undefined;
  }
  const value = answer.trim();
  if (!value) {
    return undefined;
  }
  if (
    schema.minLength !== null &&
    schema.minLength !== undefined &&
    value.length < schema.minLength
  ) {
    return undefined;
  }
  if (
    schema.maxLength !== null &&
    schema.maxLength !== undefined &&
    value.length > schema.maxLength
  ) {
    return undefined;
  }
  // ACP schemas are supplied by the child process. Do not execute an
  // untrusted regular expression on the server event loop.
  if (schema.pattern) return undefined;
  return value;
}

function resolveNumber(
  schema: Extract<PropertySchema, { readonly type: "number" | "integer" }>,
  answer: unknown,
): number | undefined {
  const value =
    typeof answer === "number"
      ? answer
      : typeof answer === "string" && answer.trim()
        ? Number(answer.trim())
        : Number.NaN;
  if (!Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) {
    return undefined;
  }
  if (schema.minimum !== null && schema.minimum !== undefined && value < schema.minimum) {
    return undefined;
  }
  if (schema.maximum !== null && schema.maximum !== undefined && value > schema.maximum) {
    return undefined;
  }
  return value;
}

function resolveBoolean(answer: unknown): boolean | undefined {
  if (typeof answer === "boolean") {
    return answer;
  }
  if (typeof answer !== "string") {
    return undefined;
  }
  switch (answer.trim().toLowerCase()) {
    case "yes":
    case "true":
      return true;
    case "no":
    case "false":
      return false;
    default:
      return undefined;
  }
}

function resolveField(field: FormField, answer: unknown): ElicitationContent | undefined {
  if (field.schema.type === "boolean") {
    const value = resolveBoolean(answer);
    return value === undefined ? undefined : { [field.key]: value };
  }
  if (field.schema.type === "number" || field.schema.type === "integer") {
    const value = resolveNumber(field.schema, answer);
    return value === undefined ? undefined : { [field.key]: value };
  }

  const options = field.options;
  if (options.length === 0) {
    if (field.schema.type !== "string") {
      return undefined;
    }
    const value = resolveText(field.schema, answer);
    return value === undefined ? undefined : { [field.key]: value };
  }

  const values = answerValues(answer);
  if (!values || values.length === 0) {
    return undefined;
  }
  if (field.schema.type === "string" && values.length !== 1) {
    return undefined;
  }
  const selected: Array<string> = [];
  const custom: Array<string> = [];
  for (const value of values) {
    const selectedValue = resolveSelectedValue(value, options);
    if (selectedValue === undefined) {
      custom.push(value);
    } else {
      selected.push(selectedValue);
    }
  }
  if (custom.length > 0 && !field.otherKey) {
    return undefined;
  }
  if (field.schema.type === "array") {
    const itemCount = selected.length + custom.length;
    if (
      field.schema.minItems !== null &&
      field.schema.minItems !== undefined &&
      itemCount < field.schema.minItems
    ) {
      return undefined;
    }
    if (
      field.schema.maxItems !== null &&
      field.schema.maxItems !== undefined &&
      itemCount > field.schema.maxItems
    ) {
      return undefined;
    }
    return {
      ...(selected.length > 0 ? { [field.key]: selected } : {}),
      ...(field.otherKey && custom.length > 0 ? { [field.otherKey]: custom.join("\n") } : {}),
    };
  }
  return selected.length === 1
    ? { [field.key]: selected[0]! }
    : field.otherKey && custom.length === 1
      ? { [field.otherKey]: custom[0]! }
      : undefined;
}

/** Map an ACP primitive form into Pulse questions and a fail-closed response decoder. */
export function mapOmpAcpElicitationForm(
  request: FormRequest,
): OmpMappedElicitationForm | undefined {
  const properties = request.requestedSchema.properties ?? {};
  const required = new Set(request.requestedSchema.required ?? []);
  const fields: Array<FormField> = [];

  for (const [key, schema] of Object.entries(properties)) {
    if (key.endsWith("__other")) {
      const baseKey = key.slice(0, -"__other".length);
      const base = properties[baseKey];
      if (schema.type === "string" && base && hasSelectOptions(base)) {
        continue;
      }
    }
    const options = selectOptions(schema);
    const otherKey =
      hasSelectOptions(schema) && properties[`${key}__other`]?.type === "string"
        ? `${key}__other`
        : undefined;
    fields.push({
      key,
      ...(otherKey ? { otherKey } : {}),
      schema,
      required: required.has(key) || (otherKey !== undefined && required.has(otherKey)),
      options,
      question: makeQuestion(request, key, schema, options),
    });
  }

  if (fields.length === 0) {
    return undefined;
  }

  return {
    questions: fields.map((field) => field.question),
    resolve: (answers) => {
      if (Object.keys(answers).length === 0) {
        return cancelResponse();
      }
      const content: Record<string, string | number | boolean | ReadonlyArray<string>> = {};
      for (const field of fields) {
        const answer = answers[field.key];
        if (answer === undefined) {
          if (field.required) {
            return cancelResponse();
          }
          continue;
        }
        const resolved = resolveField(field, answer);
        if (!resolved) {
          return cancelResponse();
        }
        Object.assign(content, resolved);
      }
      if (Object.keys(content).length === 0) {
        return cancelResponse();
      }
      return { action: { action: "accept", content } };
    },
  };
}
