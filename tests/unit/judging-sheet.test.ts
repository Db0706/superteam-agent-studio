import { describe, expect, it } from "vitest";
import { col, dataRows, headerRow, layout, parseTab, totalFormula } from "@/core/judging/sheet";

const C = [
  { key: "impact", name: "Impact", description: "", weight: 60, max: 10 },
  { key: "build", name: "Build", description: "", weight: 40, max: 5 },
];
const subs = [
  { id: "s1", project: "Alpha", team: "A", university: "Cambridge", members: ["a1", "a2"], links: ["https://g/1"] },
  { id: "s2", project: "Beta", team: "B", university: "Oxford", members: ["b1"], links: [] },
  { id: "s3", project: "Gamma", team: "C", university: "Mixed", members: [], links: [] },
];

describe("judging sheet", () => {
  it("lays out columns and a weighted total formula matching the platform", () => {
    expect(headerRow(C)).toEqual(["ID", "Project", "Team", "University", "Members", "Links", "Impact (out of 10)", "Build (out of 5)", "Total /100", "Notes", "Place"]);
    expect(layout(C)).toEqual({ firstScore: 6, total: 8, notes: 9, place: 10, width: 11 });
    expect(col(0)).toBe("A");
    expect(col(26)).toBe("AA");
    expect(totalFormula(C, 2)).toBe('=IF(COUNT(G2,H2)=0,"",ROUND(IF(ISNUMBER(G2),G2/10*60,0)+IF(ISNUMBER(H2),H2/5*40,0),1))');
    expect(dataRows(C, subs)[0]).toEqual(["s1", "Alpha", "A", "Cambridge", "a1, a2", "https://g/1", "", "", totalFormula(C, 2), "", ""]);
  });

  it("reads places and scores back, matched by the hidden id", () => {
    const rows = [headerRow(C), ["s2", "Beta", "B", "", "", "", 8, 4, 80, "", "Winner"], ["s1", "Alpha", "A", "", "", "", 12, "", 60, "", "Runner-up"], ["s3", "Gamma", "C", "", "", "", "", "", "", "", ""], ["zz", "Gone", "", "", "", "", "", "", "", "", "Honourable mention"]];
    const { results, problems } = parseTab(C, rows, new Set(["s1", "s2", "s3"]));
    expect(results.map((r) => [r.submissionId, r.place, r.total])).toEqual([["s2", 1, 80], ["s1", 2, 60], ["s3", null, null]]);
    expect(results[1].scores).toEqual({ impact: 10 });
    expect(problems).toEqual(['Row for "Gone" isn\'t a final submission any more; skipped.']);
  });

  it("flags two projects in the same place and a changed header", () => {
    const rows = [headerRow(C), ["s1", "Alpha", "", "", "", "", "", "", "", "", "Winner"], ["s2", "Beta", "", "", "", "", "", "", "", "", "winner"], ["s3", "Gamma", "", "", "", "", "", "", "", "", "Third"]];
    expect(parseTab(C, rows, new Set(["s1", "s2", "s3"])).problems).toEqual(['"Gamma": Place "Third" isn\'t one of Winner, Runner-up, Honourable mention.', "Winner is given to more than one project: Alpha, Beta."]);
    const moved = [["Project", ...headerRow(C).slice(1)], ["s1", "Alpha"]];
    expect(parseTab(C, moved, new Set(["s1"])).problems[0]).toMatch(/header row has changed/);
  });
});
