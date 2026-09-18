# Number Orbit

A static 3D page (Three.js) that shows one number from a spreadsheet. There is no build step and no backend, and it costs nothing to run.

```
Google Sheet ──(published CSV, fetched by the browser every 60s)──▶ GitHub Pages site
                         └─ fallback: data.json in this repo
```

## How it works

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
   | Members | 1234 |

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
