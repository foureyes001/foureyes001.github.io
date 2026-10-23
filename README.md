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
