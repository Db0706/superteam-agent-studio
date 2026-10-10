import { createScaffoldHandler } from "@/lib/scaffold/handler";

/**
 * POST /api/scaffold → application/zip
 * Body: { name, framework, integrations } (the Project Builder's selection).
 * Composes the project from the vendored scaffold repository. Never includes
 * .env.local or any secret: only `.env.example` with empty placeholders.
 */
export const POST = createScaffoldHandler();
