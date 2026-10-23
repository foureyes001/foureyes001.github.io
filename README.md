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

## Build 14 (23 Oct 2026)
- Keyboard shortcuts (1-5 teleport in ch1, WASD/arrows, H) are ignored while you type in a text field - e.g. the Immersive Web Emulator's Rot/Pos boxes. Before, typing "-15" there teleported you to stops 1 and 5 and the digits never appeared.

## Build 15 (23 Oct 2026)
- In-VR control-wall buttons (all chapters) light up blue while the controller laser is on them, so you can see what a trigger pull will hit.

## Build 16 (23 Oct 2026) - controller laser fixed
- **The controller laser could not click any in-VR button.** A-Frame 1.7.1's raycaster only tests the shapes that belong directly to a `.clickable` element; every control-wall button, AR-panel button and door is an empty `.clickable` group whose plane/box/text are child entities, so the laser passed straight through (no highlight, no click; on ch2 it hit the board behind). `xr-quest.js` now makes the raycaster test each clickable's whole subtree, and ignores hidden objects (three.js raycasting does not check `.visible`).
- Verified with A-Frame's own raycaster + cursor (not a stand-in): leave VR, fail CRAC, ch2 and ch3 control walls, AR panel SIZE + all highlight and click; hidden panels are not hit; ch1 rack clicks unchanged.

## Build 17 (23 Oct 2026)
- AR panel and lobby cards: labels use a fixed letter size and wrap inside their button, instead of spilling into neighbouring buttons. The chapter you are in is greyed out.
- `vendor/Roboto-msdf.json` + `.png` added (from A-Frame's official `aframevr/assets` repo), so 3D text no longer needs cdn.aframe.io (no more 404s; works offline).


## Build 18 (24 Oct 2026) - real models + performance (chapter 1)
- Chapter 1 racks and cooling units are real 3D models (see credits). The old shapes stay as invisible click targets; LEDs, heat glow, beacons, alarms and labels are unchanged. Add `?models=0` to the address for the old flat look.
- Draw calls in chapter 1 cut from ~491 to ~243: racks, cooling units, LEDs, heat panels and airflow particles are instanced; static shell/tiles/trays/lights are merged. Multiview stereo is on for all pages.

## Build 19 (24 Oct 2026) - chapter 1 clean-up
- Server consoles only on A-8 and B-8 (nearest the entrance); the other 14 racks use a plain rack with no protruding front rail.
- Glowing power path removed. Replaced by a plain grey overhead busway per row with 8 drops to rack tops, fed from the UPS pair. Drills still show power failures on the UPS/ATS/generator lights and HUD.
- Airflow particles are now arrows that point along their direction of travel (cold aisle -> racks -> hot aisle -> CRAC).

## Build 20 (24 Oct 2026) - chapter 1 lighting and colour (VR)
- Stray green LED strips in front of the racks removed.
- Big surfaces are now lit instead of flat colour: light-grey 600 mm raised floor and perforated tiles, light wall panels, lighter ceiling grid, real-size tiling.
- Neutral tone mapping and balanced ambient + sky + key + fill light, reusing the existing lights (no extra lights, no reflection map: it doubled the drawing cost).
- Soft contact shadows under racks, CRACs, UPS, ATS, generator and along wall bases; faint light pools under the ceiling strips (one draw call each).
- Cable bundles recoloured to blue / black / fibre-yellow; trays look like galvanised steel.
- `?look=0` shows the build 19 look for comparison.

## 3D model credits (Creative Commons Attribution 4.0)
- `assets/industrial_switchgear.glb`: "Industrial Switchgear" by MADMOVIESINC (https://sketchfab.com/MADMOVIESINC), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/industrial-switchgear-9ad62dc3bd694bf880be78e43530008e. Changes: texture downscaled to 1024 px. Scaled and positioned in the scene.
- `assets/kipor_kde_7000_sta_generator.glb`: "Kipor KDE 7000 STA generator" by Yevgen Avramenko (https://sketchfab.com/naprimerjenya), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/kipor-kde-7000-sta-generator-0a5f7001925744c4b335f16212c1c606. Changes: materials converted from spec/gloss to metal/roughness. Scaled and positioned in the scene.
- `assets/liebert_pex_p2070ua.glb`: "Liebert PEX P2070UA" by ismadi (https://sketchfab.com/abgnokia), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/liebert-pex-p2070ua-832391e2e0c34f26acfd066552a9055a. File unchanged. Scaled and positioned in the scene.
- `assets/liebert_trinergytm_cube.glb`: "Liebert® Trinergy™ Cube" by Vertiv (https://sketchfab.com/vertiv), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/liebert-trinergytm-cube-58b145bac2884e658583d5aed1d8b3b8. File unchanged. Scaled and positioned in the scene.
- `assets/old_soviet_transformer_low-poly.glb`: "Old Soviet Transformer Low-Poly" by MrUnity (https://sketchfab.com/MrUnityCreations), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/old-soviet-transformer-low-poly-13124cf4ef264a2eabe79b92679d6d49. Changes: textures downscaled to 512 px. Scaled and positioned in the scene.
- `assets/server_v2_console.glb`: "Server V2 +console" by FlevasGR (https://sketchfab.com/FlevasGR), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/server-v2-console-f24594ece9634cec9c1210c041838371. File unchanged. Scaled and positioned in the scene.
- `assets/server_rack_plain.glb`: derived from "Server V2 +console" by FlevasGR (https://sketchfab.com/FlevasGR), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Changes: console node and the protruding front rail removed.
