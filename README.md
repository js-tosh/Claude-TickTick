# Tasks — a personal TickTick-style app for Android

To-do lists, a calendar, a Pomodoro focus timer and a habit tracker for you and
your family. No account, no server, no subscription: everything is stored on
the phone, and a backup file moves it to another device when needed.

The app has four tabs along the bottom:

| Tab | What it does |
|---|---|
| **Tasks** | Folders → lists → tasks → subtasks. Inbox, Today, Next 7 Days, All, Completed, tags, search. Due date and time, priority, notes, repeat. Quick-add shortcuts such as `Pay rent tomorrow !high #home`. |
| **Calendar** | Month, week and day views of every task with a due date. Tap a day to see it or add a task on it; tap a task to edit it. |
| **Focus** | Name what you're working on and press **Focus**: a focus block (15, 20, 25 or 30 minutes, set with the gear icon), then an alarm. The break only starts when you tap **Start break** (in the app or on the notification); until then the alarm repeats every 5 minutes and nothing counts. Same at the end of the break. **Schedule session** picks a total length in 45-minute steps and ends on its own. Every session asks for a 1–5 usefulness rating and is kept in the history, with totals per activity. The gear icon also lets you pick the alarm sound from the phone's ringtones. |
| **Habits** | Up to 4 habits. Each habit's page has **Start Pomodoro**, which runs a focus session for it and checks the habit in for today when you press End. Each has an icon, a schedule (every day, chosen weekdays, or every few days), a daily goal ("achieve it all" or an amount such as 8 glasses), a start date, goal days, a section (Morning, Afternoon, Night, Others) and reminders. The tracker shows the last 7 days; each habit opens to its streak, check-in rate, goal progress, month calendar and notes. |

## Install on an Android phone

GitHub builds the app automatically (see `.github/workflows/android.yml`).
Open one of these links **on the phone**:

- Latest version from `main`:
  <https://github.com/js-tosh/Claude-TickTick/releases/latest/download/Tasks.apk>
- Preview from the development branch:
  <https://github.com/js-tosh/Claude-TickTick/releases/download/android-preview/Tasks.apk>

Then tap the downloaded file. The first time, Android asks you to allow
installing apps from your browser; allow it and tap **Install**.

To update later, install the new APK the same way. It installs over the old
version and keeps all tasks, habits and focus history. (Uninstalling the app
deletes its data, so export a backup first if you ever do.)

On first use the app asks for permission to send notifications. Allow it:
that is how the focus alarm rings with the screen off and how habit reminders
arrive.

## Backups and moving data

Open **Tasks → ☰ → Settings & backup**.

- **Save or share backup** writes a JSON file of everything (tasks, habits,
  check-ins, focus sessions) and opens Android's share sheet: save it to Drive
  or Files, email it, or send it to a computer.
- **Spreadsheet (CSV)** is a flat list of tasks for Excel or Google Sheets.
- **Import → Merge** adds anything new and keeps the newer copy of anything
  that exists on both sides. **Replace** wipes the phone first and loads the file.
- **Copy backup / Paste a backup** does the same through the clipboard.

## The web version

The same app also runs in a browser (it is one React codebase). It keeps its
data in that browser. Two limits there: habit reminders can't be sent, and the
focus alarm only rings while the page is open.

```bash
npm install
npm run dev        # http://localhost:5173
```

`.github/workflows/deploy-pages.yml` publishes it to GitHub Pages on every push
to `main` once Pages is switched on (Settings → Pages → Source: GitHub Actions).

## Development

Requirements: [Node.js](https://nodejs.org) 20+ (22 recommended). For building
the Android app on your own computer: [Android Studio](https://developer.android.com/studio)
and JDK 21.

```bash
npm test           # unit tests (Vitest, in-memory IndexedDB)
npm run typecheck  # TypeScript
npm run build      # production web build into dist/
npm run cap:sync   # build, then copy it into android/
npm run cap:open:android   # open android/ in Android Studio (Build → Build APK)
```

### Signing

Every build, on GitHub or locally, is signed with the key in
`android/app/family-tasks.keystore` (password `family-tasks`). One fixed key is
what lets a new APK install as an update. The key is public in this repository,
which is fine for a family app that is installed by hand; to use a private key,
add the repository secrets listed at the top of `android.yml`. Changing keys
means uninstalling and reinstalling once (export a backup first).

### Project layout

```
src/
  db/          Dexie (IndexedDB) schema, repositories, backup import/export
  lib/         pure logic: dates, quick-add parser, Pomodoro engine, habit stats,
               calendar grids, notifications, platform helpers
  state/       UI state and the focus-timer store
  hooks/       live queries and view computation
  components/  tasks UI, calendar/, focus/, habits/, dialogs/
  styles/      global.css (design tokens, light/dark, phone and desktop layouts)
android/       Capacitor Android project
.github/       CI, APK build and release, GitHub Pages deploy
```

## Not in this version

- Sync between devices (by design; use backup and import)
- Reminders for individual tasks (habits have reminders; tasks show due times)
- Drag-and-drop reordering
