# Tasks — a personal TickTick-style to-do app

Offline-first to-do lists for you and your family. No account, no server, no
subscription: every person's data lives on their own device, and a JSON backup
moves it between devices when needed.

- **Folders → lists → tasks → subtasks**, like TickTick
- Smart views: Inbox, Today (with Overdue), Next 7 Days, All, Completed, and one view per tag
- Due date and time, priorities (high / medium / low), tags, notes, repeating tasks
- Quick-add shortcuts: `Pay rent tomorrow !high #home`, `Call mom friday !2`, `Dentist 2026-10-03`, `next week`
- Search, sort (manual / due date / priority / title), light and dark themes
- Export to JSON (full backup) or CSV (spreadsheet); import by merging or replacing
- Installable PWA on the web; the same code ships as an Android app through Capacitor

## How the pieces fit

| Piece | What it is | Where data lives |
|---|---|---|
| Web app | React + Vite PWA in `src/` | The browser's IndexedDB (per browser, per site) |
| Android app | The web build wrapped by Capacitor in `android/` | IndexedDB inside the app's private storage |
| Backup | `Settings & backup → Backup (JSON)` | A file you keep; import it anywhere |

There is deliberately **no sync**. Your phone and your laptop each hold their own
list, and each family member has their own. Use export/import to copy data across.

## Requirements

- [Node.js](https://nodejs.org) 20 or newer (22 recommended)
- For the Android app only: [Android Studio](https://developer.android.com/studio)
  (it installs the Android SDK and a Java runtime)

Everything is free. No developer account is needed to share the APK with family.

## Run the web app locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # unit tests (Vitest, runs against an in-memory IndexedDB)
npm run typecheck  # TypeScript
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
```

## Host the web app for free (GitHub Pages)

The repository already contains `.github/workflows/deploy-pages.yml`, which
builds and publishes on every push to `main`.

One switch has to be flipped by hand first, because the Actions token is not
allowed to create a Pages site on its own:

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Re-run the latest "Deploy to GitHub Pages" workflow from the Actions tab
   (or push any commit to `main`).
3. The app is live at `https://<your-user>.github.io/<repo-name>/` — for this
   repository, <https://js-tosh.github.io/Claude-TickTick/>.

Until step 1 is done the build job passes and the deploy job fails with a 404
that says "Ensure GitHub Pages has been enabled". That is the expected message.

Share that link with family. On a phone, "Add to Home Screen" installs it like an
app and it keeps working offline. Each person's tasks stay in their own browser.

Any static host works too (Cloudflare Pages, Netlify, a home server): run
`npm run build` and upload `dist/`. If the app is served from a sub-path, set
`BASE_PATH=/that-path/` when building, as the workflow does.

## Build the Android app

The first build is mostly waiting for Android Studio to download the SDK.

```bash
npm install
npm run cap:sync          # builds the web app and copies it into android/
npm run cap:open:android  # opens the android/ project in Android Studio
```

In Android Studio:

1. Let it finish syncing Gradle (first time takes several minutes).
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Click *locate* in the notification: the file is
   `android/app/build/outputs/apk/debug/app-debug.apk`.

Send that APK to family members (chat, email, USB). On their phone they tap it,
allow "install from this source" once, and it installs. A debug APK is fine for
personal use; nothing expires.

After changing the app, run `npm run cap:sync` again and rebuild the APK.

To test on a plugged-in phone or the emulator directly: `npm run cap:run:android`.

App id and name are set in `capacitor.config.ts` (`com.family.tasks`, "Tasks").
Change them before the first install if you like; changing the id later makes
Android treat it as a different app.

## Backup, restore, and moving between devices

Open **Settings & backup** (bottom of the sidebar).

- **Backup (JSON)** downloads everything: folders, lists, tasks, subtasks, tags.
- **Spreadsheet (CSV)** is a flat task list for Excel or Google Sheets. It is
  for viewing; the JSON file is the one you restore from.
- **Copy backup** puts the JSON on the clipboard, for hosts or WebViews that
  block downloads. Paste it into **Paste a backup** on the other device.
- **Import → Merge** adds anything new and keeps the newer version of anything
  that exists on both sides. Nothing is deleted. Safe to run repeatedly.
- **Import → Replace** wipes the device first and loads the file as-is.

Backups are plain JSON, so they are easy to inspect or process with other tools.

## Project layout

```
src/
  db/          Dexie (IndexedDB) schema, repository functions, backup import/export
  hooks/       live queries and the pure view computation (Today, Next 7 Days, …)
  lib/         date helpers, quick-add parser, ids
  state/       UI state (current view, selected task, theme, sort)
  components/  Sidebar, MainPane, TaskList, TaskRow, TaskDetail, dialogs
  styles/      global.css (design tokens, light/dark, responsive layout)
android/       Capacitor Android project (generated; open in Android Studio)
public/icons/  app icons (SVG source + PNGs used by the PWA manifest)
```

## Not in this version

- Multi-device sync (by design; use export/import)
- Reminder notifications on the phone (Capacitor's local-notifications plugin
  is the natural next step; the data model already stores due date and time)
- Drag-and-drop reordering (manual order currently puts newest tasks first)
- Calendar view
