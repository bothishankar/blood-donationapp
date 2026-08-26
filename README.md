# Blood Donation App — Connected Version

Connected to your Google Apps Script API.

API endpoint:
https://script.google.com/macros/s/AKfycbx7gcSCqv4BNrzXpcVMrJnvYvJwR7xbL3Yus0MdtLjmD5wASeKqEj0JxrtkffojFQ/exec

Expected GitHub Pages URL:
https://bothishankar.github.io/Bothi/

## Publish
1. Upload the contents of this folder to the root of `bothishankar/Bothi`.
2. Commit to `main`.
3. GitHub → Settings → Pages → Source: GitHub Actions.
4. Wait for the Pages workflow to finish.
5. Open https://bothishankar.github.io/Bothi/

## Admin
Initial account created by `setupDatabase()`:
Username: admin
Password: admin123

Change the password before public launch.

## Data
The app now calls the Apps Script API for users, donors, blood requests, history, notifications, settings and dashboard data. The browser is only used to retain the current login session.
