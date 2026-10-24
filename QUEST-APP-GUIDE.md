# Inside the Cloud — install on the Meta Quest 2 as an app (Windows)

Follow this yourself in a **Windows terminal** (Command Prompt or PowerShell).
Steps marked **YOU** are yours only: accounts, sign-ins, passwords, the cable, the headset.

- **Part A (fonts) and Part B (GitHub Pages): done.** The site is live at
  https://foureyes001.github.io; `vendor/Roboto-msdf.*` and `.nojekyll` are in the repo.
- **This guide builds the 2D app first.** Immersive mode comes later (see the end).
- Meta's guide: https://developers.meta.com/horizon/documentation/web/pwa-packaging/

---

## 0. Before packaging: test in the Quest Browser
If something fails here, the app won't fix it. In the **Quest Browser** on the Quest 2, open https://foureyes001.github.io, then check:
- The stamp reads "build 31c".
- Going through a lobby gate in VR keeps you in VR in the chapter.
- In ch3, **Switch to AR** works and the globe appears in passthrough.
  - The Quest 2 passthrough is greyscale; the emulator only tested a Quest 3.
  - If the "Continue in AR" card appears, note its `reason:` line.
- **Back to VR** works.
- Each exit takes you to the main hall.
- Sounds play at sensible volumes, and the panels are readable.

---

## 1. One-time setup
1. **Node.js 18 or newer:** install the LTS from nodejs.org. Open a *new* terminal and check `node -v`.
2. Install Meta's packaging tool:
   ```
   npm i -g @meta-quest/bubblewrap-cli
   bubblewrap --version
   ```
3. **Android Platform Tools (adb):** install Google's "SDK Platform-Tools for Windows", unzip it, and add the folder to PATH. You can also run `adb.exe` from inside that folder. Check with `adb version`.

## 2. Create the project
```
mkdir %USERPROFILE%\inside-the-cloud-app
cd %USERPROFILE%\inside-the-cloud-app
bubblewrap init --manifest=https://foureyes001.github.io/manifest.json --metaquest
```
Answer the questions:
- **Install a JDK 17 / Android SDK?** → **Yes**. It's a large download, first time only.
- **App mode** → **2D**.
- **Package ID** → `io.github.foureyes001.insidethecloud`
- **Meta App ID** → **skip / leave empty.** It's only needed for in-app purchases (Horizon Billing).
- **Signing key** → create a new one.
  - **YOU** choose and type both passwords (keystore and key), and write them down.
  - Keep `android.keystore` safe and backed up.
  - **Every update must use the same key and the same package ID.** Without them you can never update the app.
- Everything else → accept the default it shows.

## 3. Prove you own the website (Digital Asset Links)
1. Get the key's SHA-256 fingerprint:
   ```
   keytool -list -v -keystore android.keystore -alias android
   ```
   - Type the keystore password.
   - Copy the line starting `SHA256:`.
   - If `keytool` isn't recognised, use the JDK Bubblewrap installed: see `jdkPath` in `%USERPROFILE%\.bubblewrap\config.json`, then run `<jdkPath>\bin\keytool`.
2. Add it to the project:
   ```
   bubblewrap fingerprint add <the SHA256 value>
   ```
   This writes `assetlinks.json` into the project folder.
3. **Send `assetlinks.json` to Claude.** Claude publishes it at `/.well-known/assetlinks.json` in the repo.
4. Check that https://foureyes001.github.io/.well-known/assetlinks.json opens and shows JSON. Allow 1–3 minutes after publishing.

## 4. Edit the Gradle files
- Open the **app module's** `build.gradle`, normally `app\build.gradle`. Set the target SDK to 32, with the comment on the line above:
  ```
  //noinspection ExpiredTargetSdkVersion
  targetSdkVersion 32
  ```
  (Edit the existing target-SDK line. Keep whichever spelling it uses: `targetSdkVersion` or `targetSdk`.)
- In **any** `build.gradle` whose `repositories { … }` lists `jcenter()`, replace it with `mavenCentral()`. Check both `app\build.gradle` and the top-level `build.gradle`.

## 5. Build
```
bubblewrap build
```
- Type the passwords when asked.
- This produces **`app-release-signed.apk`** in the project folder.

## 6. Install on the Quest 2
1. **YOU: turn on Developer Mode.** In the **Meta Horizon** phone app: open your headset's settings → **Developer Mode** → on.
   - If the app asks you to create or join a developer organisation, do that at developers.meta.com/horizon.
2. **YOU:** connect the headset with a **USB-C data cable** (not charge-only). Put the headset on and accept **Allow USB debugging**.
3. In the project folder:
   ```
   adb devices
   adb install app-release-signed.apk
   ```
   - `adb devices` must list the headset as `device`, not `unauthorized`.
4. On the headset: **Library → Unknown Sources → Inside the Cloud**.
5. Run the same checks as step 0 inside the app.
   - The app shouldn't show a browser address bar. If it does, the asset links are failing (see the table below).

---

## Good to know
- **The app loads the live site, so it needs internet.** Use a phone hotspot for the demo.
  - Site updates need no rebuild: once a change is on GitHub, the app picks it up.
- **Unverified:**
  - Meta's page doesn't name supported headsets. The Quest 2 is likely but not confirmed.
  - Whether Bubblewrap requires a service worker is also unverified; the site has none.
  - If `init` or `build` complains, send Claude the **exact message**.

## Immersive mode (later, not yet)
Immersive mode launches straight into VR. It needs all three of these first:
1. **A lobby change:** `index.html` must enter VR by itself right after it loads, but only when running as the installed app.
   - Detect the app with the Digital Goods API or `matchMedia('(display-mode: standalone)')`.
   - It must never do this in a normal browser tab.
   - Today the lobby only enters VR from its button, or when you arrive through a gate already in VR.
2. **A test** that VR survives gate travel inside the installed app. So far this has only been seen in the Quest Browser.
3. **A check** that ch3's VR↔AR switch still has a usable fallback. The "Continue in AR" card is a 2D page element.

To switch later, set `horizonOSAppMode` in `twa-manifest.json`, then run `bubblewrap update` and `bubblewrap build`. Keep the same keystore and package ID.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "TWA verification was unsuccessful" | Package ID, fingerprint and assetlinks URL must all match. Re-check steps 2–3; the URL must return JSON. |
| App shows a URL bar (2D) / won't open (immersive) | Asset links failing. Same checks as above. |
| Wrong app mode | `horizonOSAppMode` in `twa-manifest.json`, then rebuild. |
| JDK or Android SDK errors | Fix `jdkPath` / `androidSdkPath` in `%USERPROFILE%\.bubblewrap\config.json` (`~/.bubblewrap/config.json`). |
| `adb devices` lists nothing | Charge-only cable, or the "Allow USB debugging" prompt is waiting inside the headset. |
| `adb` / `keytool` not recognised | adb: Platform-Tools folder (step 1.3). keytool: JDK `bin` folder (step 3.1). |
| No VR button | It's the site, not the app. Test in the Quest Browser (step 0). |
| Changes don't show | The app loads the live site. Wait 1–3 minutes after the change is on GitHub, then reopen the app. |
