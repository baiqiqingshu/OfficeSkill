import Ajv from "ajv";
import { documentSchema } from "./schema";
import { validateSpec } from "./validate";
import type { DiagramDocument } from "./types";
const checkDocument = new Ajv({
  allErrors: true,
  strict: false,
}).compile<DiagramDocument>(documentSchema);
export function validateDocument(input: unknown): DiagramDocument {
  if (!checkDocument(input))
    throw new Error(
      `多图文档无效：${checkDocument.errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("；")}`,
    );
  const ids = new Set<string>();
  for (const [index, spec] of input.diagrams.entries()) {
    try {
      validateSpec(spec);
    } catch (error) {
      throw new Error(
        `第 ${index + 1} 张图：${error instanceof Error ? error.message : error}`,
      );
    }
    if (spec.id) {
      if (ids.has(spec.id)) throw new Error(`图形存在重复 ID：${spec.id}`);
      ids.add(spec.id);
    }
  }
  return input;
}
export function normalizeDocument(input: unknown): DiagramDocument {
  if (input && typeof input === "object" && "diagrams" in input)
    return validateDocument(input);
  const spec = validateSpec(input);
  return { version: 1, title: spec.title, diagrams: [spec] };
}
