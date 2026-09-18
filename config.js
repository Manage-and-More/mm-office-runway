// Site configuration. Owned by core.
export const config = {
  // Google Sheets → File → Share → Publish to web → sheet → CSV. Expected layout:
  //   A      | B
  //   funds  | monthly_cost
  //   6000   | 1000
  // Leave empty to use data.json.
  sheetCsvUrl: "",
  fallbackJsonUrl: "data.json",
  refreshSeconds: 60,

  avatarIndexUrl: "data/avatar-index.json",

  // PLACEHOLDERS: agree on the real numbers with the team.
  healthyMonths: 12, // runway at which health = 1
  moods: [
    // first match wins, otherwise "thriving"
    { mood: "panic", belowMonths: 2 },
    { mood: "worried", belowMonths: 4 },
    { mood: "calm", belowMonths: 8 },
  ],
};
