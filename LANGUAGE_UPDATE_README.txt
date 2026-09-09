PNBDC Pagelayout_1 - Admin / Sub Admin RBAC

WHAT IS INCLUDED
- Premium layout package retained.
- Super Admin behavior: existing role "admin" has full permissions.
- Sub Admin accounts with custom permissions.
- Permissions are stored in Users!Permissions_JSON.
- Backend enforces permissions; UI also hides inaccessible admin sections.
- Public donor mobile numbers are masked server-side as XXXXXX1234.
- Admin donor data is served only through getAdminDonors and requires donors.view.
- Admin donor listing count: 10 / 20 / 50 / All.
- Bulk Upload label for donor Excel import.
- Reports & Excel section.
- Existing donor, blood request, event, notification, BothiAI and ID-card logic retained.

FIRST-TIME GOOGLE APPS SCRIPT STEPS
1. Replace Code.gs with the included Code.gs.
2. Save the Apps Script project.
3. Run setupDatabase() once and approve permissions if prompted.
4. Run createOrResetAdmin() once if the existing admin account needs repair.
5. Deploy a NEW web app version using the same deployment URL if possible.
6. Existing admin username/password remains the current configured account.
7. Log in as Admin and open Admin Management.
8. Create Sub Admin and select permissions.

SUB ADMIN PERMISSION KEYS
- dashboard.view / dashboard.export
- donors.view / donors.add / donors.edit / donors.delete / donors.import / donors.export / donors.generate
- requests.view / requests.add / requests.edit / requests.delete / requests.export / requests.generate
- events.view / events.add / events.edit / events.delete / events.export / events.generate
- updates.view / updates.add / updates.edit / updates.delete / updates.export
- notifications.view / notifications.add / notifications.edit / notifications.delete
- reports.view / reports.export
- social.view / social.add / social.edit / social.delete
- about.view / about.edit
- settings.view / settings.edit
- admin.manage

SECURITY NOTE
Do not publish or expose Google Apps Script secrets/API keys in frontend files. Gemini remains configured through Script Properties.
POONGURICHI NANBARGAL BLOODS CLUB - PREMIUM FINAL UPDATE

This package keeps the existing application structure, fields and backend logic and includes the latest donor self-update and admin blood-request image features.

Latest additions / refinements:
- Premium animated splash screen with PN logo, glow, rings, particles and heartbeat.
- Latest Updates section.
- Donor self-update: Donor ID + DOB (DDMMYYYY) -> only Last Donation Date can be changed.
- Admin blood-request notification -> Generate Request image.
- My Club branding on generated blood-request share card.
- Public Find Donor restrictions remain unchanged; no admin-only donor data is exposed by this UI update.
- Exact blood-need contacts shown in the latest supplied reference:
  Ragubathi - 7402591727
  Dhanavenkadesh - 9585559593
- Developed By details retained:
  Bothishankar.Natarajan - 9677824319
- Existing Gemini/BothiAI, Tamil/English, donor ID, Alternate_Mobile, Language, photo, Excel, notifications, events and admin functionality retained.

Website files:
index.html
style.css
app.js
Code.gs
appsscript.json
manifest.json
sw.js
icons/*


LOGO UPDATE:
The supplied Poongurichi Nanbargal Blood Donors Club logo is now used consistently for the club logo, splash logo, header logo, donor ID card logo, blood request card logo, PWA icons, Apple touch icon and notification icon. BothiAI artwork remains unchanged.
PNBDC Language Update

1. Whole web UI language selector: English / Tamil. Preference is saved in browser localStorage.
2. Tamil text entry automatically selects Tamil for the donor ID card.
3. Donor ID cards use Tamil labels when donor Language=ta or Tamil text is detected.
4. Google Apps Script adds a Language column to the Donors sheet safely; existing data is preserved.
5. Deploy the updated Google Apps Script code before testing new Tamil registrations.
