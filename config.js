// Where the number comes from. Edit this file, commit, done.
export const config = {
  // Google Sheets → File → Share → Publish to web → pick the sheet → "CSV" → copy the link.
  // Expected sheet layout (row 1 is a header):
  //   A        | B
  //   label    | value
  //   Members  | 1234
  // Leave empty to only use data.json.
  sheetCsvUrl: "",

  // Fallback (and the default when sheetCsvUrl is empty). Edit it right in the GitHub web UI.
  fallbackJsonUrl: "data.json",

  // How often to re-check the source while the page is open.
  refreshSeconds: 60,
};
