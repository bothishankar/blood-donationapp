BLOOD DONATION APP - READY PWA STARTER

Open index.html using a local web server (recommended) or deploy the folder to GitHub Pages, Cloudflare Pages, Netlify, etc.

Default Admin Login:
Username: admin
Password: admin123

IMPORTANT: This package is a working browser/PWA prototype using local browser storage. It does NOT yet write to the supplied Google Sheet because Google OAuth/Apps Script credentials are required.

To connect the existing Google Sheet securely, create a Google Apps Script Web App API and replace the localStorage data functions in app.js with API calls. Do not expose passwords in a public sheet.

Admin Settings currently allow organization name, app name, logo URL, colour, headline, contact and admin credentials.
