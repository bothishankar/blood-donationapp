# Blood Donation App — GitHub Pages Ready

Static/PWA frontend prepared for GitHub Pages.

## Repository

`https://github.com/bothishankar/Bothi`

## Files

- `index.html` — application entry point
- `app.js` — application logic
- `style.css` — responsive styling
- `manifest.json` — PWA manifest
- `sw.js` — service worker
- `icons/` — PWA icons
- `.nojekyll` — prevents Jekyll processing
- `404.html` — fallback page
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment

## Publish using GitHub Pages

### Method A — easiest

1. Open the repository: `https://github.com/bothishankar/Bothi`
2. Upload/copy all files from this folder into the repository root.
3. Commit the changes to the `main` branch.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, select **GitHub Actions**.
6. Open **Actions** and wait for **Deploy Blood Donation App to GitHub Pages** to finish.
7. Your project site will be:

   `https://bothishankar.github.io/Bothi/`

### Method B — branch deployment

If you do not want Actions, use **Settings → Pages → Deploy from a branch → main → /(root) → Save**.

Do not use both deployment methods at the same time.

## Admin

Current prototype default login:

- Username: `admin`
- Password: `admin123`

Change the admin password before real use.

## Important Google Sheet note

The current app is a browser/PWA prototype and stores data locally. GitHub Pages is static hosting, so it cannot securely receive/write Google Sheet data by itself.

For the requested production version, connect the app to Google Sheets through a Google Apps Script Web App/API. Never publish passwords or service-account credentials in this repository.

## PWA

After deployment, open the site in Chrome/Edge on Android or desktop and use **Install app / Add to Home screen** when offered.
