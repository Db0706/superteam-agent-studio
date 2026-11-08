import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideBuildHref } from "@/components/start/FirstTenMinutes";
import { GUIDE_MODULES, GUIDES } from "@/config/guide";
import { FW_ORDER, normalizeIntegrations } from "@/config/integrations";
import { composeScaffold, VENDOR_DIR } from "@/lib/scaffold/compose";
import { parseBuilderParams } from "@/lib/project-builder/url-state";

const ROOT = join(process.cwd(), VENDOR_DIR);

/** What a student reads in their download: every README and package.json in the ZIP. */
function docsInZip(framework: (typeof FW_ORDER)[number]): string {
  const { files } = composeScaffold(ROOT, { framework, modules: [...GUIDE_MODULES], name: "my-first-paid-agent" });
  return files
    .filter((f) => /(^|\/)(README\.md|package\.json)$/.test(f.path))
    .map((f) => f.data.toString("utf8"))
    .join("\n");
}

describe("First 10 minutes guide", () => {
  it("covers every framework, in the same six steps", () => {
    for (const fw of FW_ORDER) {
      expect(GUIDES[fw].framework).toBe(fw);
      expect(GUIDES[fw].steps.map((s) => s.id)).toEqual(["download", "install", "wallets", "faucet", "run", "pay"]);
    }
  });

  it.each(FW_ORDER)("only gives commands the %s download documents", (fw) => {
    const docs = docsInZip(fw);
    for (const step of GUIDES[fw].steps) {
      for (const { cmd } of step.commands) {
        // `cd` and package.json script names are checked loosely: the folder or script must exist.
        if (cmd === "cd ..") continue;
        if (cmd.startsWith("cd ")) expect(docs, cmd).toContain(cmd.slice(3));
        else if (cmd.startsWith("npm run ") && !cmd.includes(" -- ")) expect(docs, cmd).toMatch(new RegExp(`"${cmd.slice(8).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`));
        else expect(docs, cmd).toContain(cmd);
      }
    }
  });

  it.each(FW_ORDER)("links to a %s Builder download that includes the paid API", (fw) => {
    const cfg = parseBuilderParams(guideBuildHref(fw).split("?")[1]);
    expect(cfg.framework).toBe(fw);
    expect(normalizeIntegrations(cfg.integrations, fw)).toEqual(expect.arrayContaining(["payments", "spending", "paidapi"]));
  });
});
