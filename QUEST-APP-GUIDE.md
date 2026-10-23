# Inside the Cloud — publish to GitHub Pages and install on a Meta Quest

Windows laptop. Do Parts A–C in order. Part C reuses everything from A and B.
Things only you can do (accounts, passwords, the headset) are marked **YOU**.

---

## Part A — Fonts (2 minutes, recommended)

3D text uses A-Frame's font. The pages now prefer a bundled copy so text works
even without internet. Download these two files in your browser
(right-click → Save as) into the `vendor` folder, keeping the names exactly:

- `https://cdn.aframe.io/fonts/Roboto-msdf.json` → `vendor/Roboto-msdf.json`
- `https://cdn.aframe.io/fonts/Roboto-msdf.png`  → `vendor/Roboto-msdf.png`

If you skip this, text still loads from the internet as before.

---

## Part B — GitHub Pages (about 20 minutes)

1. **YOU:** sign in at github.com.
2. **New repository** → name it **exactly** `<your-username>.github.io`
   (e.g. `agastya123.github.io`) → **Public** → Create.
   This exact name matters: the Quest app needs a file at the very root of the site.
3. **uploading an existing file** → drag in **everything in this folder, including the
   `vendor` folder** → Commit changes.
4. **Add file → Create new file** → name it `.nojekyll` → leave it empty → Commit.
   (Drag-and-drop often skips files whose names start with a dot.)
5. **Settings → Pages** → Source: **Deploy from a branch** → **main** → **/ (root)** → Save.
6. Wait 1–3 minutes, then open `https://<your-username>.github.io` on the laptop.
7. **Test on the Quest before making the app:** open the same address in the
   **Quest Browser** → walk to a door → in each chapter press **VR** → point a
   controller and pull the trigger. If VR doesn't work here, the app won't fix it.

---

## Part C — The Quest app (Meta's packaging tool, 1–3 hours the first time)

This wraps the website above into an APK that runs on the Quest Browser's engine,
so WebXR works. (The old `datacentre_6.apk` used a plain Android WebView, which
has no WebXR, so it could never enter VR.)

### C1. One-time setup
1. **Node.js 18 or newer:** install the LTS from nodejs.org, then in a new terminal check `node -v`.
2. **YOU — Meta developer account:** at developers.meta.com/horizon, create an app in the
   Developer Dashboard and copy its **App ID**.
3. **YOU — Developer Mode on the headset:** in the **Meta Horizon** phone app, open your
   headset's settings and turn on **Developer Mode** (needs the developer account above).
4. Install the tool:
   ```
   npm install --global @meta-quest/bubblewrap-cli
   ```

### C2. Create the project
```
mkdir %USERPROFILE%\inside-the-cloud-app
cd %USERPROFILE%\inside-the-cloud-app
bubblewrap init --manifest=https://<your-username>.github.io/manifest.json --metaquest
```
Answer the questions:
- Install a JDK / Android SDK? → **Yes** (large download, first time only).
- App mode → **2D** first. (Immersive launches straight into VR; try it later,
  once 2D works, because moving between chapters ends a VR session.)
- Package ID → e.g. `io.github.<yourusername>.insidethecloud` (lowercase, letters, dots).
- Meta App ID → paste the ID from C1.2.
- Signing key → create a new one. **YOU choose and type the passwords, and write them
  down.** Keep `android.keystore` safe: without it you can never update the app.

### C3. Prove you own the website (Digital Asset Links)
An app that fails this check **will not launch** (immersive mode) or shows a URL bar (2D).
1. Get the key's SHA-256 fingerprint, then add it:
   ```
   keytool -list -v -keystore android.keystore
   bubblewrap fingerprint add <the SHA256 value>
   ```
2. Bubblewrap writes an `assetlinks.json` into the project folder.
3. In your GitHub repo: **Add file → Create new file** → name
   `.well-known/assetlinks.json` → paste the file's contents → Commit.
4. Check `https://<your-username>.github.io/.well-known/assetlinks.json` opens in a browser.
   If it shows 404, the `.nojekyll` file from Part B is missing.

### C4. Build and install
```
bubblewrap build
```
This produces **`app-release-signed.apk`**.

**YOU:** connect the Quest with a USB-C data cable, put it on, and accept
**Allow USB debugging**. Then:
```
adb devices
adb install app-release-signed.apk
```
On the headset: **Library → Unknown Sources → Inside the Cloud**.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| `adb devices` lists nothing | Charge-only cable, or the "Allow USB debugging" prompt is waiting inside the headset. |
| `adb` not recognised | Use the copy in the Android SDK bubblewrap installed, or install "Android SDK Platform-Tools". |
| App opens with an address bar / won't open | Asset links mismatch: check C3, package ID, fingerprint, and that the file is reachable. |
| No VR button | It's the site, not the app. Test in the Quest Browser (B7). |
| Text missing | Part A fonts not uploaded and no internet. |
| Changes don't show | The app loads the live site: upload the new file to GitHub and wait 1–3 minutes. No rebuild needed. |
