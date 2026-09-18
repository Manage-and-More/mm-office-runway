// Site configuration. Owned by core.
export const config = {
  // Google Sheets → File → Share → Publish to web → sheet → CSV. Expected layout:
  //   A      | B
  //   funds  | monthly_cost
  //   6000   | 1000
  // Leave empty to use data.json.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJNV8-j-8K19uNPBu9wCNbyg0sJbqAU_cZGdb1J5V6s-dlbByYk6_F4DxOQCqEBZgwLL3SlhV28REI/pub?gid=870853279&single=true&output=csv",
  fallbackJsonUrl: "data.json",
  refreshSeconds: 60,

  avatarIndexUrl: "data/avatar-index.json",

  // Where the "Keep our office" button sends people. Leave empty to hide the button.
  donateUrl: "",

  healthyMonths: 12, // how many month chips the HUD calendar shows

  // Money → feelings (see src/core/feelings.js). Tunable live in the Simulate panel.
  stress: {
    midMonths: 3, // runway where stress = 0.5: "the month people start sweating"
    width: 1.2, // how gradual the S-curve is, in months
  },
  feelings: {
    stressSeconds: 3, // displayed stress eases to a new value over ~this long
    emotionSeconds: 8, // a donation/loss reaction fades over ~this long
  },
};
