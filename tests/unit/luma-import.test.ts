import { describe, expect, it } from "vitest";
import { mapStatus, mapTicket, parseCsv, parseLumaCsv } from "@/core/registrations/luma";

const SAMPLE = [
  "api_id,name,first_name,last_name,email,approval_status,checked_in_at,ticket_name,What university are you at?",
  'gst-1,"Okafor, Amara",Amara,Okafor,AMARA@cam.ac.uk,approved,,Standard Hackathon Participant,Cambridge',
  "gst-2,Jonas Hartley,Jonas,Hartley,jonas@ox.ac.uk,pending_approval,,Standard Hackathon Participant,Oxford",
  "gst-3,Mei Chen,Mei,Chen,mei@cam.ac.uk,approved,2026-10-25T08:55:00.000Z,Panel Talks Only,Cambridge",
  "gst-4,Dup,,,amara@cam.ac.uk,approved,,Standard Hackathon Participant,",
  "gst-5,No Email,,,,approved,,Standard Hackathon Participant,",
  "gst-6,Declined Person,,,dec@ox.ac.uk,declined,,Standard Hackathon Participant,Oxford",
].join("\n");

describe("Luma CSV import", () => {
  it("parses quoted fields with commas", () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });

  it("maps tickets and statuses", () => {
    expect(mapTicket("Panel Talks Only")).toBe("panel");
    expect(mapTicket("Standard Hackathon Participant")).toBe("hackathon");
    expect(mapStatus("approved", false)).toBe("approved");
    expect(mapStatus("pending_approval", false)).toBe("pending");
    expect(mapStatus("declined", false)).toBe("declined");
    expect(mapStatus("approved", true)).toBe("checked_in");
  });

  it("previews rows, duplicates and problems, separating panel-only attendees", () => {
    const r = parseLumaCsv(SAMPLE);
    expect(r.rows.map((x) => x.email)).toEqual(["amara@cam.ac.uk", "jonas@ox.ac.uk", "mei@cam.ac.uk", "dec@ox.ac.uk"]);
    expect(r.rows[0]).toMatchObject({ full_name: "Okafor, Amara", ticket: "hackathon", status: "approved", university: "Cambridge", external_id: "gst-1" });
    expect(r.rows[2]).toMatchObject({ ticket: "panel", status: "checked_in", checked_in_at: "2026-10-25T08:55:00.000Z" });
    expect(r.duplicates).toEqual(["amara@cam.ac.uk"]);
    expect(r.problems).toEqual([{ line: 6, message: "Missing email." }]);
    expect(r.counts).toEqual({ hackathon: 3, panel: 1, approved: 1, pending: 1, declined: 1, checkedIn: 1 });
    expect(r.columns.university).toBe("What university are you at?");
  });

  it("explains a file with no email column", () => {
    expect(parseLumaCsv("name,status\nA,approved").problems[0].message).toMatch(/No email column/);
  });
});
