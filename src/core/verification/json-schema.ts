/**
 * A small JSON Schema subset validator for structured-output checks: type, required,
 * properties, additionalProperties, items, enum, minimum/maximum, minLength/maxLength,
 * format: "date". Returns readable problems ("age: expected integer, got string") that are
 * safe to show participants because they describe the schema, which participants are given.
 */
export type JsonSchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: "date";
  description?: string;
};

const typeOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);

export function validateJson(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const problems: string[] = [];
  const at = path === "$" ? "the result" : path.replace(/^\$\./, "");
  if (schema.type) {
    const actual = typeOf(value);
    const fits = schema.type === "number" ? actual === "number" || actual === "integer" : actual === schema.type;
    if (!fits) return [`${at}: expected ${schema.type}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) problems.push(`${at}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${at}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${at}: too long`);
    if (schema.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) problems.push(`${at}: must be a date like 2026-10-25`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${at}: needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${at}: at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => problems.push(...validateJson(item, schema.items!, `${path}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) problems.push(`${path === "$" ? "" : `${at}.`}${key}: missing`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in obj) problems.push(...validateJson(obj[key], sub, `${path}.${key}`));
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) if (!(key in (schema.properties ?? {}))) problems.push(`${path === "$" ? "" : `${at}.`}${key}: not allowed`);
    }
  }
  return problems;
}
