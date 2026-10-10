/**
 * Framework → template directory, mirroring `FRAMEWORK_DIRS` in the scaffold
 * repository's `scripts/compose.mjs`. Only these frameworks can be composed by
 * the in-memory port (compose.ts). A framework that appears in the vendored
 * catalog.json but not here stays preview-only instead of failing at download.
 * Safe for client code.
 */
export const FRAMEWORK_DIRS: Readonly<Record<string, string>> = { next: "templates/nextjs", node: "templates/node" };

export const isComposableFramework = (framework: string): boolean => Object.hasOwn(FRAMEWORK_DIRS, framework);
