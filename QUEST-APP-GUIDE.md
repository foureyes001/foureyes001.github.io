# Inside the Cloud — install on the Meta Quest 2 as an app (Windows)

Steps marked **YOU** are yours only: accounts, sign-ins, passwords, licences, the cable, the headset.

- **Done:**
  - Fonts and GitHub Pages: the site is live at https://foureyes001.github.io.
  - The 2D app was built (25 Oct 2026) and installed (29 Oct).
  - **Build 39 (29 Oct): the app is switched to immersive.** It opens straight into VR. Rebuild with `1-build.bat`, then reinstall with `2-install.bat`.
  - Asset links are published at `/.well-known/assetlinks.json`.
- **App:** package `io.github.foureyes001.insidethecloud`, launcher name "Inside Cloud", **immersive** mode (since build 39; was 2D), version 2, sideload only.
- Meta's guide: https://developers.meta.com/horizon/documentation/web/pwa-packaging/

---

## 0. Test in the Quest Browser first
In the **Quest Browser** on the Quest 2, open https://foureyes001.github.io and check:
- The stamp is correct.
- Lobby gates keep you in VR.
- ch3: **Switch to AR** shows the globe in greyscale passthrough and it stays put. If a "Continue in AR" card appears, note its `reason:` line.
- **Back to VR** works, the exits lead to the main hall, and the sounds and panels are fine.

---

## 1. Build the APK: the scripts do it
The scripts are in `tools/quest-app/` in this repo. The laptop copy is `C:\Users\naray\Videos\arvr\inside-the-cloud-app\`.
- `1-build.bat` runs `package-quest.ps1 -Step build`:
  1. Installs Meta's Bubblewrap CLI (`npm i -g @meta-quest/bubblewrap-cli`). Its first run downloads JDK 17 and the Android SDK.
  2. Runs `bubblewrap init --manifest=https://foureyes001.github.io/manifest.json --metaquest`, only if there's no project yet. Answers are in `CHEATSHEET.txt`.
  3. Keeps Meta's original init settings. Turning the Platform SDK off also removes Meta's `horizonpermissions` library, so it stays on (decided 25 Oct). If an older run removed them, it restores them with `bubblewrap update --skipVersionUpgrade`.
  4. Edits Gradle: `targetSdkVersion 32` with `//noinspection ExpiredTargetSdkVersion`; `jcenter()` becomes `mavenCentral()`.
  5. Checks the SDK (build-tools, the compile platform) and installs anything missing.
  6. Builds with `gradlew.bat assembleRelease`, then `zipalign`, then `apksigner sign`. **YOU** type the keystore password, then the key password if asked.
     - `bubblewrap build` itself fails on Node 18.20.2+ / 20.12.2+ for Windows with `spawn EINVAL`, because Node no longer starts `.bat` files directly (nodejs/node#52554). So the script does the same steps itself.
  7. Checks the APK (package, targetSdk 32), reads its SHA-256 fingerprint, and writes `assetlinks.json` (`bubblewrap fingerprint add`).
- **When it says BUILD DONE:** if the fingerprint changed, send `assetlinks.json` to Claude to publish. It only changes with a new key.
- **Keep the key safe:** keep `project\android.keystore` and both passwords backed up. **Every update needs the same key and package ID.**
- **Forgotten password (happened 29 Oct):** `3-new-key.bat` makes a new key, `project\android-2.keystore`, and points `twa-manifest.json` at it. The old key is left untouched. `1-build.bat` then signs with the new key and adds its fingerprint; Claude publishes the new `assetlinks.json`. `2-install.bat` asks before removing the old app, which Android requires when the key changes.
- Every step is logged to `status.log`.

## 2. Install on the Quest 2
1. **YOU:** create a Meta developer organisation at developers.meta.com/horizon (done 25 Oct).
2. **YOU:** in the **Meta Horizon** phone app, pair the Quest 2, then open its headset settings → **Developer Mode** → on. Restart the headset.
3. **YOU:** connect the headset with a **USB-C data cable**, put it on, and tap **Allow** for USB debugging.
4. Double-click `2-install.bat`. It finds `adb` in Bubblewrap's SDK, checks the headset is listed as `device`, then runs `adb install -r app-release-signed.apk`.
5. On the headset: **Library → Unknown Sources → Inside Cloud**.
   - There should be **no browser address bar**. A bar means asset links are failing.
   - Repeat the step 0 checks inside the app.

---

## Good to know
- **The app loads the live site, so it needs internet.** Use a phone hotspot for the demo.
  - Site updates need no rebuild.
  - Rebuild only for app changes: name, mode, icon, permissions.
- **Unverified:**
  - Meta's page doesn't name supported headsets. The Quest 2 is likely but not confirmed.
  - Whether Bubblewrap requires a service worker. The build worked without one.

## Immersive mode (build 39, done)
- **The site:** inside the app every page enters VR by itself. Meta's test for "inside the app" is `window.getDigitalGoodsService`; in the Quest Browser nothing changes. If the headset refuses (no user action yet), a large **Enter VR** button appears.
- **The app:** `horizonOSAppMode` is `immersive` and the version is 2 in `project\twa-manifest.json`. The 2D original is backed up as `twa-manifest.2d-build32.json`.
- **`1-build.bat`:** regenerates the Android project (`bubblewrap update --skipVersionUpgrade`, needs internet), then builds and signs. **YOU** type the keystore password. The key and package ID are the same, so `2-install.bat` installs over the 2D app.
- **Meta:** an immersive app does not launch at all if the asset-links check fails. If the 2D app showed a browser address bar, fix that first.
- **To test in the app:**
  - the lobby gates and the chapter buttons keep you in VR
  - ch3 Switch to AR and Back to VR
  - Exit VR. If the app closes or shows a blank window, tell Claude.
- **Going back to 2D:** copy `twa-manifest.2d-build32.json` over `twa-manifest.json` and tell Claude (the script expects immersive).

## If something goes wrong

| Symptom | Fix |
|---|---|
| `cli ERROR read ECONNRESET` / download stuck | Network dropped. Run the `.bat` again; finished steps are skipped. |
| `cli ERROR spawn EINVAL` | `bubblewrap build` on a new Node. Use `1-build.bat`, which avoids it. |
| "TWA verification was unsuccessful" / URL bar | Package ID, fingerprint and the assetlinks URL must match. Compare `status.log` SHA-256 with the published file. |
| Wrong app mode | `horizonOSAppMode` in `twa-manifest.json`, then `bubblewrap update`, then `1-build.bat`. |
| JDK or Android SDK errors | `jdkPath` / `androidSdkPath` in `%USERPROFILE%\.bubblewrap\config.json`. |
| `adb devices` empty / `unauthorized` | Charge-only cable, Developer Mode off, or the Allow prompt is waiting inside the headset. |
| No VR button | It's the site, not the app. Test in the Quest Browser (step 0). |
