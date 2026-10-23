# Inside the Cloud — The Journey of a Request

BACSE341 — Fundamentals of Augmented and Virtual Reality. SDG 4: Quality Education.

Walk through the entrance hall (`index.html`) and enter a chapter through its door.

| # | Chapter | File | Owner |
|---|---|---|---|
| 1 | Inside a Data Centre | `datacentre.html` | Shrestha Agarwal (25BCE5790) |
| 2 | Load Balancing & Auto-Scaling | `loadbalancer.html` | Rishyaa Sharan (25BCE5299) |
| 3 | CDN & Edge Caching | `cdn.html` | Agastya Narayan (25BCE5219) |

Built with A-Frame 1.7.1 (bundled in `vendor/`) and WebXR. Runs on Meta Quest
(Quest Browser or the packaged app), Android Chrome and desktop browsers.
All latencies, loads and failures are simulated for teaching, not measured.

Coastline data: Natural Earth 110m land (public domain), bundled as `ne_110m_land.js`.

See `QUEST-APP-GUIDE.md` to publish and install on a Quest.

## Build 12 (23 Oct 2026) - Quest fixes
- **VR movement fixed.** Every page's thumbstick code called `scene.camera.object3D`, which does not exist, so the first stick push threw a TypeError and nobody could move. Now in `xr-quest.js`: left stick walks where you look, right stick snap-turns 30 degrees. Reads the raw WebXR gamepads, so it works with any controller.
- **AR on the Quest (passthrough, markerless).** Every page now has an AR button. In AR the room walls, floor and background hide so your real room shows through. Chapter 3 places the globe in front of you automatically (no floor scan, no HTML buttons needed); pick cities with the controller laser.
- **In-VR control walls (ch1, ch3)** used to spawn 2.1 m behind you; now in front.
- **Quest Browser 2D view:** the on-screen stick is shown (there is no keyboard).
- Every page shows a build number (bottom-right, or the header in ch3).
- New file: `xr-quest.js` (shared by all four pages - upload it too).

## Build 13 (23 Oct 2026) - interactive AR in every chapter
- **AR buttons were hidden on all four pages** by a leftover `.a-enter-ar{display:none!important}` style from the merge. Removed, so AR is reachable.
- **Chapters 1 and 2 in AR = a table-size model**, like the CDN globe: it appears 1.4 m in front of you at table height (0.7 m). Walls and ceiling hide; the floor stays. Everything on the model is still clickable (controller laser on the Quest, a tap on a phone).
- **AR panel** (to your right): SIZE -/+, TURN </>, BRING HERE, chapter buttons (LOBBY, CH1, CH2, CH3) and EXIT AR. On the Quest the right stick also turns the model. The chapter's own control wall appears behind the model.
- **Lobby in AR:** three chapter cards.
- **Switching chapter in AR:** the next page shows "Continue in AR" - one click and you are back in AR (a new page always ends the XR session).
- **Chapter 3:** the panel's size/turn/here buttons drive the globe; on a phone the AR bar has Lobby / Ch 1 / Ch 2 buttons.
- In AR the tour and teleport in chapter 1 pause (`DC.arOn`), and walking with the left stick is off - walk for real.
