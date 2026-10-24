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

## Build 31c (24 Oct 2026) - AR with the Immersive Web Emulator (all pages)
- Reproduced with Meta's own emulator runtime (IWER, compiled from source) in a test browser: when the emulator extension installs its fake headset after A-Frame has loaded, A-Frame keeps the PC's original answer ("AR not supported") forever, so every enterAR() failed with "immersive-ar mode not supported" although the page reported AR available.
- xr-quest.js now re-asks the browser at the moment AR/VR is started (and refreshes the answer at 1.5 s and 4 s after load and on 'devicechange'), shows A-Frame's AR/VR button again when the browser supports it, and lets A-Frame request a session when the browser says a headset is there. A real Quest answers the same both times.
- Second emulator bug found the same way: A-Frame's AR hit-test helpers listen for every later session start and call requestHitTestSourceForTransientInput, which the emulator lacks; the throw stopped "Back to VR" from finishing. A rejecting stand-in is now supplied when a session lacks it (A-Frame already handles the rejection).
- Emulator results (both load orders): page AR button -> AR; VR -> Switch to AR -> AR; Back to VR -> VR. Stamps read "build 31c".

## Build 31b (24 Oct 2026) - chapter 3 "Start AR" fix
- After a refused switch, the "Start AR" card did nothing when the page still believed VR was on (A-Frame answers "Already in VR."). The switch now checks the headset's real session: if one is still running it is ended first, and leftover VR/AR flags are cleared before AR is requested.
- Chapter 3 never offers sessions to the browser (navigator.xr.offerSession disabled for this page), since an outstanding offer can block the AR request.
- The fallback card shows the browser's own error ("reason: ..."); the Debug card shows the last switch result. Chapter 3's stamp reads "build 31b".

## Build 31 (24 Oct 2026) - sounds, and chapter 3 opens in VR with a VR <-> AR switch
- Sound effects on every page, generated with Web Audio (no audio files, nothing to license, works offline; `?sound=0` mutes):
  - quiet footsteps whenever you move with the thumb stick, WASD or the touch joystick (about one per 0.8 m; none for real walking in AR, snap turns or teleport jumps);
  - a softer "charge-up" chime when you walk up to any gate (the three main-hall gates, the chapter 2 and 3 portals);
  - a louder futuristic teleport whoosh when you go through a gate or switch chapter from a menu - the page waits 0.65 s so it is heard;
  - chapter 1's exit plays a pneumatic sliding-door sound as the doors open and close (no whoosh there).
  - Browsers only start audio after a user action, so sound wakes on any click, key, touch, trigger press or VR/AR start.
- Chapter 3 now opens in VR like chapters 1 and 2 (the build 30 block on the browser's session hand-over is removed). The flat page shows both VR and AR buttons.
  - In VR the CDN panel floats at the lower left with all controls (size works on the VR globe too) and a teal "Switch to AR" button; the readout card floats above the globe.
  - "Switch to AR" ends the VR session, waits for the headset to really end it, then starts AR. In AR the button reads "Back to VR" and does the reverse. Lobby / Ch 1 / Ch 2 from AR first return to VR, so the next chapter also opens in VR.
  - If the headset refuses to start the new mode from a controller press, a full-screen card offers "Start AR" / "Start VR" as one ordinary click.
  - A-Frame's own VR/AR buttons offer a new session to the browser whenever one ends; those offers are now skipped mid-switch and while any session is active.
- Chapter 3's ceiling no longer writes depth: as one huge disc above the viewer it wrote wrong depth and hid the VR readout card and the ceiling light rings.

## Build 30 (24 Oct 2026) - stay in VR between chapters, side panels, one exit per chapter
- Chapters 1 and 2 stay in VR when you arrive from a lobby gate. The Quest Browser grants the session and A-Frame re-enters VR. Chapter 3 blocks that grant, so it never auto-enters VR (AR only).
- The chapter 1 "HALL CONTROLS" wall is gone. Chapters 1 and 2 now use a compact panel that floats at the lower left of the view and follows lazily: it only re-centres after you walk ~0.3 m or turn ~40 degrees.
  - It is visible when VR starts, and the Y button hides or shows it.
  - Shared `lazy-follow` component and `XRQ.yToggle` helper in xr-quest.js.
- Each chapter has exactly one exit, styled to its environment, and it always leads to the main hall (index.html):
  - Chapter 1: brushed-steel sliding security doors with a card reader, a backlit MAIN HALL sign and a green EXIT sign; the leaves slide open as you approach.
  - Chapter 2: a cyan energy portal in the rack ring. The old second doorway is filled with racks.
  - Chapter 3: a teal portal.
  - Shared `portal-door` component in xr-quest.js.
- Chapter-to-chapter travel is now through the panels' Chapters row (main hall / chapter 1 / 2 / 3), not doors.

## Build 29 (24 Oct 2026) - lobby final design pass
- Floor: 2 m tiles with engraved geometric (circuit-like) patterns - concentric chamfered grooves, corner links, via pads and lit cyan/amber inlays - shaded so the grooves read as depth.
- Walls: classic raised frames with recessed panels, engraved inset lines, rivets, a lit dado rail and vent panels. Ceiling: coffered bays. All depth comes from light/shadow in the textures (no extra geometry).
- Neon: tubes are now real tubes with soft halos; the outer ones curve outward and down near the back (as in the concept) and end in lamp fittings; the centre pair stops above the title.
- Gates are more vibrant: brighter rims, a pulsing glow band, a lit outer edge, stronger halo, spill and floor pads.
- Light particles (not in the reference): motes orbit all three gates; sparks rise and drift along the amber floor line; motes flow along the cyan floor lanes towards the gates.
- Hazy floor reflections: soft wet-floor streaks under each gate and under each neon tube replace the mirror-sharp copies.
- Tank: darker water, a glossy copper coil (highlight along the tube), and 320 matte (non-glowing) specks drifting in the water alongside the bright bubbles.
- All graph screens removed; the two consoles show a rack-status light grid; above the side gates there are lit vent boxes, and the back corners get tall amber light columns.

## Build 28 (24 Oct 2026) - lobby rebuilt as a sci-fi corridor
- index.html + new lobby.js: a 13 x 17 m corridor after the user's concept image - ribbed sloped ceiling with converging cyan/orange neon tubes, panelled walls with pilasters, pipes and drooping cable bundles, a circuit-pattern floor with soft reflections (mirrored glow under a semi-transparent floor), and an "INSIDE THE CLOUD" title wall.
- Three chapter gates (Ch 1 yellow, Ch 2 cyan, Ch 3 teal): chamfered metal frames, glowing rims, animated energy portals with pulsing tunnel rings, a label plate (chapter, title, one-line teaser) and floor light pads. Walk into a gate or click it with the laser - same behaviour as before.
- Liquid-cooling tank (replaces the concept's plant tank): glass column with glowing coolant, an orange heat-exchanger coil, rising bubbles, pump plinth with LEDs and a live status gauge, pipes into the wall with flowing light.
- Props: bench with under-glow, standing consoles with holo screens, wall screens with live graphs, ceiling security cameras with blinking LEDs.
- The lobby is VR-only now (AR is only chapter 3). Walking is clamped to the corridor.
- Geometry is batched per material (about 150-220 draw calls depending on the view; 10-35k triangles).

## Build 27 (24 Oct 2026) - chapter 3 AR panel floats instead of riding the controller
- The AR control panel is no longer attached to the left controller (it blocked the view and was hard to aim at). It now floats about 0.8 m away at the lower-left of where you look, faces you, and drifts after you only when you turn or walk away (`lazy-follow`).
- Point EITHER controller at it and pull the trigger. Press **Y** on the left controller to hide/show it.
- The debug card sits to the left of the panel so the globe stays clear.

## Build 26 (24 Oct 2026) - chapter 3 becomes AR-only for the Quest app
- Chapter 3 (cdn.html) offers **AR only**: the VR button, the in-VR control wall and the shared AR MODEL panel are gone on this page (chapters 1 and 2 and the lobby are unchanged, VR as before).
- Globe recoloured to the original navy (#14335e, lit) with cyan coastlines (#7ee8fa); no painted land.
- Normal page: the grey room became a chapter-2 style hall (rack ring with LED strips, lit wall, ceiling light rings, LED bokeh, line-drawn floor grid, glow ring under the globe). The "Click a user city" caption and ROUTE panel moved clear of the top bar and tab bar.
- Quest AR controls, one panel on the **left controller** (point with the right controller, pull the trigger): Clear all caches, Labels on/off, Spin on/off, Readouts on/off, Debug on/off, Size -/+, Cache TTL slider (click the bar or use -/+), Lobby / Ch 1 / Ch 2, Exit AR. Chapter buttons leave AR first, so the next chapter opens normally for VR.
- The globe is placed in front of you automatically, stays fixed in the room and you walk around it (thumb sticks do not move you in AR). Size grows/shrinks it in place, never into the floor.
- Readout card (route, HIT/MISS, latency bar, hit ratio, TTL) floats above the globe and turns to face you; debug info shows as a card beside the panel.
- In AR the hall, the chapter 2 door and the teaching board are hidden: only the globe, its labels, the readout card and your panel.
- Phone AR is unchanged (HTML button bar via dom-overlay).

## Build 25 (24 Oct 2026) - chapter 2 final touches
- Users-to-balancer fibres now really start at the Users panel's edge (they were bunching at the balancer), with 360 streaming fibre dots.
- Ceiling halo above the beam: bigger ring, warmer and lighter glow.
- Each instance gets 5 strands that leave from the balancer's side facing it and spread across its top.
- Auto-scaling demo: while auto-scaling is ON, traffic surges (about 3x for 40 s, then 36 s calm), so the pool visibly scales 2 -> 4 and back to 2. Turning auto-scaling on starts a surge within about 3 s. Decisions use averaged CPU. Requests are shorter (avg 0.55 s), so the base load sits at about 40% on 2 instances.
- New instances materialise: a wireframe hologram with a scan line, then the server grows up out of the floor; its beams pulse while it launches and carry traffic once it is live (5 s launch).
- Databases: glassy lit tops (white-hot centre, bright rim), a soft light column rising off each, bigger halos.
- Test hook: `LB.scaleOut()`.

## Build 24 (24 Oct 2026) - chapter 2 rebuilt as a futuristic control hall
- New round hall:
  - Background ring of server racks with blue and amber LEDs (chapter 1's rack model).
  - Ceiling ring lights and a reflective-looking floor.
  - Twinkling distant lights.
- The load balancer floats on a tower over a glowing platform, with a spinning core crystal and a light beam from the ceiling.
- Flowing light strands with moving pulses:
  - From the Users panel into the balancer.
  - From the balancer out to every instance; colour shows load (cyan, gold, red).
  - From the instances down to the database tier, with replication arcs from the primary to the replicas.
  - Every live request and database operation travels the strands as a glowing particle.
- Instances on an arc, each with a live card (CPU, connections, latency). A new instance appears as a wireframe "Launching..." hologram with a progress bar.
- Panels around the hall, all live:
  - What this room teaches
  - Users (live): world map, regions, requests per second
  - Auto-scaling controller: CPU graph, scale-out progress, on/off toggle, cooldown
  - Load balancing algorithms
  - Queue
  - Database live console, with a kill/restore replica button
- 4 working algorithms: least connections, round robin, weighted (smooth weighted round robin) and IP hash (sticky by user). Click a row on the algorithms panel, use TRAFFIC & POOL, or use the VR control deck.
- Top tabs (and keys 1/2/3, and the VR deck) jump between viewpoints: Overview, Load Balancing & Auto-Scaling, Database Tier.
- All existing controls are kept: traffic, algorithm, auto-scaling, cooldown, read share, kill/restore replica, explain, reset, chapters.
- The VR control deck, the explain boards and the info pop-ups are drawn on canvas, so they stay sharp in the headset.
- Built only from three.js built-in materials, so it is safe with Quest multiview. Around 190 draw calls and 164k triangles. Lighter than chapter 1 in the headless frame test. AR was not tuned (VR only, as agreed).

## Build 23 (24 Oct 2026)
- Cooling-unit fans: the blades are now brushed aluminium behind a dark graphite guard, so the spin is easy to see against the black unit.

## Build 22 (24 Oct 2026) - chapter 1: cabling, containment, realistic cooling units
- Cabling:
  - Steel cable trays run over both rack rows, with blue, black and fibre-yellow bundles inside.
  - A cable drop goes into each of the 72 cabinets, and links climb up to the trays above the aisle.
  - Everything is merged into 4 draw calls.
- Cold-aisle containment: a lightly tinted glass roof sits on the rack tops, with steel frames. Each end has sliding glass doors, left part-open so the aisle stays walkable.
- Cooling units, shown with Guides on:
  - The cartoon fan icons are now real-looking fans: a steel ring, 6 dark swept blades and a wire guard.
  - The cyan panel is now a steel slatted intake grille, and the olive panel is now a steel return duct.
  - Fans still spin and stop on failure. Drill colours now show on the status light, label and alarm ring instead of the panels.

## Build 21 (24 Oct 2026) - chapter 1: photo textures, guides, fuller room
- B, photo textures (CC0): raised-floor tiles, perforated aisle grates, painted wall panels, office ceiling tiles and brushed steel (trays, beams, ducts, insulated pipes). Small JPGs in `assets/tex/`; the hand-drawn version shows until each photo has loaded. `?photo=0` turns them off.
- C, guides: teaching helpers (teleport rings, info spheres, CRAC fan icons and labels, coloured floor washes and lines) are hidden by default. The **Guides** button in MOVE & VIEW, the VR menu or the G key shows them. Rack names are smaller grey plates; the dark row plinths are gone.
- D, fuller room:
  - Each rack row is continuous: 56 extra cabinets fill the gaps. They are scenery only and add no draw calls.
  - Power room: modular UPS line-up (Vertiv Trinergy Cube), switchgear as the ATS, a steel electrical cabinet as the utility incomer, and an enclosed diesel generator. The status lights, labels and click targets used by the drills are kept.
  - Props: fire extinguishers and a hand truck.
- Switches for testing on the Quest: `?fill=0` (no fill-in racks), `?power=0` (old power-room shapes), `?props=0`, `?photo=0`, `?look=0`, `?models=0`.
- About 377k triangles at the entrance view, within Meta's Quest 2 guidance of 750k-1M. Frame rate still needs checking on the headset.

## 3D model credits (Creative Commons Attribution 4.0)
- `assets/industrial_switchgear.glb`: "Industrial Switchgear" by MADMOVIESINC (https://sketchfab.com/MADMOVIESINC), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/industrial-switchgear-9ad62dc3bd694bf880be78e43530008e. Changes: texture downscaled to 1024 px. Scaled and positioned in the scene.
- `assets/kipor_kde_7000_sta_generator.glb`: "Kipor KDE 7000 STA generator" by Yevgen Avramenko (https://sketchfab.com/naprimerjenya), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/kipor-kde-7000-sta-generator-0a5f7001925744c4b335f16212c1c606. Changes: materials converted from spec/gloss to metal/roughness. Scaled and positioned in the scene.
- `assets/liebert_pex_p2070ua.glb`: "Liebert PEX P2070UA" by ismadi (https://sketchfab.com/abgnokia), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/liebert-pex-p2070ua-832391e2e0c34f26acfd066552a9055a. File unchanged. Scaled and positioned in the scene.
- `assets/liebert_trinergytm_cube.glb`: "Liebert® Trinergy™ Cube" by Vertiv (https://sketchfab.com/vertiv), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/liebert-trinergytm-cube-58b145bac2884e658583d5aed1d8b3b8. File unchanged. Scaled and positioned in the scene.
- `assets/old_soviet_transformer_low-poly.glb`: "Old Soviet Transformer Low-Poly" by MrUnity (https://sketchfab.com/MrUnityCreations), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/old-soviet-transformer-low-poly-13124cf4ef264a2eabe79b92679d6d49. Changes: textures downscaled to 512 px. Scaled and positioned in the scene.
- `assets/server_v2_console.glb`: "Server V2 +console" by FlevasGR (https://sketchfab.com/FlevasGR), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Source: https://sketchfab.com/3d-models/server-v2-console-f24594ece9634cec9c1210c041838371. File unchanged. Scaled and positioned in the scene.
- `assets/server_rack_plain.glb`: derived from "Server V2 +console" by FlevasGR (https://sketchfab.com/FlevasGR), licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Changes: console node and the protruding front rail removed.

## Textures and props (CC0, public domain, no credit required)
- Textures from ambientCG (https://ambientcg.com): OfficeCeiling001, SheetMetal002, Tiles043, PaintedPlaster017, Metal009. They are toned and cut to size in `assets/tex/`.
- Props from Poly Haven (https://polyhaven.com): `korean_fire_extinguisher_01`, `hand_truck`. They are packed into single GLBs with only the colour textures, at 512 px.

