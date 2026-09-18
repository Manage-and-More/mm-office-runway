# MM Office Runway

Manage & More is a student-led organization. We crowdfunded our office and now have to keep it. This page shows **how much runway the office has left**, in a way people actually notice.

## The scene (planned)

- The **Manage & More logo** sits in the middle, built in 3D.
- **Mii-style avatars of donors** walk around it.
- **Funds high:** avatars are happy and chill, and the logo is whole.
- **Funds low:** avatars panic and run faster in different directions, and the logo **cracks and breaks apart**.
- **Money added:** the logo pieces fly back together.

> Current state: this is the starter scaffold (a placeholder 3D scene plus the data pipeline). The runway scene is being built next.

## Architecture

A static 3D page (Three.js) that reads one number from a spreadsheet. There is no build step and no backend, and it costs nothing to run.

```
Google Sheet ──(published CSV, fetched by the browser every 60s)──▶ GitHub Pages site
                         └─ fallback: data.json in this repo
```

### Stack

| Piece | Choice | Why |
|---|---|---|
| Hosting | GitHub Pages (via `.github/workflows/pages.yml`) | Free, deploys on every push to `main` |
| 3D | Three.js 0.170 from jsDelivr via an import map | No bundler, no `node_modules` |
| Data | Google Sheet → *Publish to web* → CSV | Free, CORS-enabled, edit from your phone |
| Fallback | `data.json` | Works with no sheet at all; edit it in the GitHub web UI |

When the number changes, the crystal pulses, the counter animates to the new value, and the number of orbiting cubes grows on a log scale.

## Connect a sheet

1. Make a Google Sheet like this:

   | A | B |
   |---|---|
   | label | value |
   | Months of runway | 6 |

2. Go to **File → Share → Publish to web**, choose that sheet, choose **Comma-separated values (.csv)**, then click **Publish** and copy the URL.
3. Paste it into `sheetCsvUrl` in [`config.js`](config.js) and push.

Changes show up within about 5 minutes, because Google caches published CSVs. Anyone with the URL can read the published sheet, so put only the public number in it.

### What about Excel?

Excel Online / OneDrive share links don't send CORS headers, so a browser page can't read them directly. Your options:
- Keep using Excel and paste the number into the Google Sheet or `data.json` yourself.
- Add a scheduled GitHub Action that downloads the Excel file (`...?download=1`), reads the cell, and commits `data.json`. It's still free, but it needs a small script.

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. Use a server, because opening the file directly with `file://` blocks ES modules.

## Deploy

1. Push to a **public** GitHub repo. GitHub Pages for private repos needs a paid plan.
2. Go to **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` then deploys to `https://<owner>.github.io/<repo>/`.

Other free hosts that work the same way: Cloudflare Pages, Netlify, and Vercel. Point any of them at this repo with no build command and `/` as the output folder.
