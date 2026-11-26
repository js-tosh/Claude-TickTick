# Firebase setup (one time, about 15 minutes)

The cloud features (sign-in, Cloud lists, Shared with me) use a free Firebase
project that you own. Local lists keep working without any of this.

Everything here is on the free **Spark** plan. No card is needed.

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Create a project** (or **Add project**). Name it, for example, `just-do-it`.
3. Google Analytics: turn it **off** (not needed). Click **Create project**.

## 2. Turn on sign-in

1. Left menu: **Build → Authentication → Get started**.
2. Tab **Sign-in method**:
   - **Email/Password** → Enable → Save. (Leave "Email link" off.)
   - **Google** → Enable → pick your email as the support email → Save.
3. Tab **Settings → Authorized domains** → **Add domain** → `js-tosh.github.io`
   (for the web version). `localhost` is already there.

## 3. Create the database

1. Left menu: **Build → Firestore Database → Create database**.
2. Location: pick one near you, e.g. `nam5 (United States)`. This can't be changed later.
3. Start in **production mode** → Create. (The app's security rules replace the
   defaults later; until then nobody can read or write anything, which is safe.)

## 4. Register the Android app

1. Project overview (house icon) → **Add app** → Android icon.
2. **Android package name:** `com.family.tasks`
3. **App nickname:** `Just Do-IT! Android`
4. **Debug signing certificate SHA-1:**
   `6C:69:A7:40:EC:DE:C3:74:74:D3:3C:CD:67:F4:1A:39:D6:4F:8A:D3`
5. **Register app** → **Download google-services.json** → then **Next** through the
   remaining steps (the app is already set up for them) → **Continue to console**.
6. Add the second fingerprint: gear icon → **Project settings** → scroll to your
   Android app → **Add fingerprint** →
   `A6:CC:30:DA:B5:78:F5:DB:11:59:DF:AE:18:C4:BE:9A:FF:98:A8:F3:BF:2E:C6:F8:77:B5:13:65:50:24:D5:08`
   → Save.

These are the fingerprints of the key every APK from this repo is signed with;
Google sign-in only works for apps signed with a registered key.

## 5. Register the web app

1. **Project settings → General → Your apps → Add app** → Web icon (`</>`).
2. Nickname `Just Do-IT! Web`. Leave Firebase Hosting unticked. **Register app**.
3. It shows a `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., ... }` block.

## 6. Send Claude these two things

- The **`firebaseConfig`** block from step 5 (paste it in the chat).
- The **`google-services.json`** file from step 4 (attach it, or paste its contents).

Both are safe to share and to keep in the repository: they only say *which*
project the app talks to. What protects the data is sign-in plus the database
security rules (`firestore.rules`), which Claude will give you to paste into
**Firestore Database → Rules** before cloud lists go live.
