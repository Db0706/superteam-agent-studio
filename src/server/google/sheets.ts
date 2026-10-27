import "server-only";
import { dataRows, headerRow, layout, PLACES, TRACK_TAB, type SheetSubmission, type Track } from "@/core/judging/sheet";
import type { RubricCriterion } from "@/core/judging/results";
import { google } from "./client";

export interface TrackInput {
  track: Track;
  criteria: RubricCriterion[];
  submissions: SheetSubmission[];
}

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

/** Creates the judging sheet in the organiser's Drive: one formatted tab per track. */
export async function createJudgingSheet(token: string, title: string, tracks: TrackInput[]): Promise<{ id: string; url: string }> {
  const created = await google<{ spreadsheetId: string; spreadsheetUrl: string; sheets: { properties: { sheetId: number; title: string } }[] }>(token, SHEETS, {
    method: "POST",
    body: {
      properties: { title },
      sheets: tracks.map((t, i) => ({ properties: { sheetId: i + 1, title: TRACK_TAB[t.track], gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 } } })),
    },
  });
  const id = created.spreadsheetId;

  await google(token, `${SHEETS}/${id}/values:batchUpdate`, {
    method: "POST",
    body: {
      valueInputOption: "USER_ENTERED",
      data: tracks.map((t) => ({ range: `'${TRACK_TAB[t.track]}'!A1`, values: [headerRow(t.criteria), ...dataRows(t.criteria, t.submissions)] })),
    },
  });

  const requests = tracks.flatMap((t, i) => {
    const sheetId = i + 1;
    const L = layout(t.criteria);
    const rows = Math.max(1, t.submissions.length);
    const range = (c0: number, c1: number, r0 = 1, r1 = rows + 1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
    return [
      { repeatCell: { range: range(0, L.width, 0, 1), cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.086, green: 0.086, blue: 0.086 }, wrapStrategy: "WRAP", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)" } },
      { repeatCell: { range: range(0, L.width), cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } }, fields: "userEnteredFormat(wrapStrategy,verticalAlignment)" } },
      { repeatCell: { range: range(L.firstScore, L.total), cell: { userEnteredFormat: { backgroundColor: { red: 0.94, green: 0.925, blue: 1 }, horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(backgroundColor,horizontalAlignment)" } },
      { repeatCell: { range: range(L.total, L.total + 1), cell: { userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: "CENTER" } }, fields: "userEnteredFormat(textFormat,horizontalAlignment)" } },
      { repeatCell: { range: range(L.place, L.place + 1), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.957, blue: 0.86 }, textFormat: { bold: true } } }, fields: "userEnteredFormat(backgroundColor,textFormat)" } },
      ...t.criteria.map((c, k) => ({
        setDataValidation: {
          range: range(L.firstScore + k, L.firstScore + k + 1),
          rule: { condition: { type: "NUMBER_BETWEEN", values: [{ userEnteredValue: "0" }, { userEnteredValue: String(c.max) }] }, inputMessage: `Score 0 to ${c.max}`, strict: true, showCustomUi: true },
        },
      })),
      { setDataValidation: { range: range(L.place, L.place + 1), rule: { condition: { type: "ONE_OF_LIST", values: PLACES.map((p) => ({ userEnteredValue: p })) }, strict: true, showCustomUi: true } } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 260 }, fields: "pixelSize" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 6 }, properties: { pixelSize: 170 }, fields: "pixelSize" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: L.firstScore, endIndex: L.notes }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: L.notes, endIndex: L.notes + 1 }, properties: { pixelSize: 260 }, fields: "pixelSize" } },
      { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: L.place, endIndex: L.place + 1 }, properties: { pixelSize: 170 }, fields: "pixelSize" } },
      { addProtectedRange: { protectedRange: { range: range(0, L.width, 0, 1), description: "Header row: don't edit", warningOnly: true } } },
    ];
  });
  await google(token, `${SHEETS}/${id}:batchUpdate`, { method: "POST", body: { requests } });
  return { id, url: created.spreadsheetUrl };
}

/** Shares the sheet with each judge as an editor. Returns the emails it couldn't share with. */
export async function shareWith(token: string, id: string, emails: string[], message: string): Promise<string[]> {
  const failed: string[] = [];
  for (const email of emails) {
    try {
      await google(token, `https://www.googleapis.com/drive/v3/files/${id}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(message)}`, {
        method: "POST",
        body: { type: "user", role: "writer", emailAddress: email },
      });
    } catch {
      failed.push(email);
    }
  }
  return failed;
}

/** Reads each track's tab back as raw values. A missing tab comes back empty. */
export async function readTabs(token: string, id: string, tracks: Track[]): Promise<Record<Track, (string | number)[][]>> {
  const ranges = tracks.map((t) => `ranges=${encodeURIComponent(`'${TRACK_TAB[t]}'!A1:Z1000`)}`).join("&");
  const res = await google<{ valueRanges: { values?: (string | number)[][] }[] }>(token, `${SHEETS}/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
  return Object.fromEntries(tracks.map((t, i) => [t, res.valueRanges[i]?.values ?? []])) as Record<Track, (string | number)[][]>;
}
