/**
 * The sheet that ships with the app.
 *
 * The id is fixed so pressing the seed button a second time updates that sheet
 * rather than making another copy of it. Sheets she builds herself get a
 * generated id as before and are never matched by this.
 */
export const SEED_SHEET = {
  id: "richard-and-john-1189-1216",
  title: "Richard and John, 1189 to 1216",
  /** Served from public/, so the 44KB only loads when the button is pressed. */
  path: "/richard-and-john.json",
} as const;
