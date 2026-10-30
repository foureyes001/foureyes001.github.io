/* xr-quest.js - shared Meta Quest / phone XR helpers for "Inside the Cloud" (build 39).
   Load with <script src="xr-quest.js"></script> right after vendor/aframe.min.js,
   before <a-scene>, so the components register before the scene is parsed.

   1. thumbstick-locomotion  VR: left stick walks, right stick snap-turns 30 deg.
      AR model mode: walking is off (walk for real); right stick turns the model.
      Reads raw WebXR gamepads first, falls back to A-Frame's thumbstickmoved.
   2. quest-ar               scene: in AR clears background + fog and hides the
                             room parts listed in `hide`.
   3. ar-model               scene: makes AR interactive like the CDN chapter.
        mode: model  - the chapter's root group becomes a table-size model in
                       front of you; panel = size, turn, bring here, chapters.
        mode: lobby  - the lobby hides and three chapter cards appear.
        mode: custom - the page places its own model (cdn.html) and supplies
                       window.XRQ_HOOKS for the panel's size/turn/here buttons.
   4. Chapter switching in AR (option A): a chapter button saves a flag, the
      next page shows "Continue in AR" - one click re-enters AR. (Loading a new
      page always ends an XR session; a click is required to start a new one.)
   5. Phone AR: a screen tap is ray-cast into the scene and clicks whatever
      .clickable it hits (the Quest uses the controller laser instead).
   6. XRQ.faceUser(el, dist, y, side) puts a panel in front of the user.
   7. Quest Browser flat 2D view: the on-screen stick is shown (no keyboard). */
(function () {
  if (typeof AFRAME === 'undefined') { return; }
  var UA = navigator.userAgent || '';
  var IS_QUEST = /OculusBrowser|Quest/i.test(UA);
  var BUILD = 'build 39';
  var XRQ = window.XRQ = { build: BUILD, isQuest: IS_QUEST, source: 'none', arModel: false,
                           stick: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } } };
  if (IS_QUEST) { document.documentElement.classList.add('coarse', 'quest'); }

  /* ---------- build 16: make the laser / mouse cursor actually hit buttons ---
     A-Frame 1.7.1's raycaster only tests the meshes that belong DIRECTLY to an
     element matching `objects` (its object3DMap). Every button, door and
     machine here is an empty `.clickable` group whose plane/box/text are CHILD
     entities, so the controller laser passed straight through them: no hover,
     no click. Fix: test each matched entity's whole subtree.
     three.js raycasting also ignores `.visible`, so hidden panels would steal
     hits; those intersections are dropped. */
  function shownChain (o) {
    for (; o; o = o.parent) { if (o.visible === false) { return false; } }
    return true;
  }
  var RC = AFRAME.components.raycaster && AFRAME.components.raycaster.Component;
  if (RC && !RC.prototype.__xrqPatched) {
    RC.prototype.__xrqPatched = true;
    RC.prototype.flattenObject3DMaps = function (els) {
      var objects = this.objects, root = this.el.sceneEl.object3D, set = [], i, el, p;
      objects.length = 0;
      for (i = 0; i < els.length; i++) {
        el = els[i];
        if (el && el.isEntity && el.object3D) { set.push(el); }
      }
      outer:
      for (i = 0; i < set.length; i++) {
        el = set[i];
        for (p = el.parentEl; p; p = p.parentEl) { if (set.indexOf(p) !== -1) { continue outer; } }
        var o = el.object3D;
        while (o.parent) { o = o.parent; }
        if (o === root) { objects.push(el.object3D); }
      }
      return objects;
    };
    var rcInit = RC.prototype.init;
    RC.prototype.init = function () {
      rcInit.apply(this, arguments);
      var ray = this.raycaster;
      if (!ray || ray.__xrq) { return; }
      ray.__xrq = true;
      var orig = ray.intersectObjects.bind(ray);
      ray.intersectObjects = function (objs, recursive, target) {
        var out = orig(objs, recursive, target);
        for (var k = out.length - 1; k >= 0; k--) {
          if (!shownChain(out[k].object)) { out.splice(k, 1); }
        }
        return out;
      };
    };
  }

  var CHAPTERS = [
    { href: 'index.html',        short: 'LOBBY',       title: 'ENTRANCE HALL',   sub: 'start here' },
    { href: 'datacentre.html',   short: 'CH1 DATA CTR', title: 'CH 1  DATA CENTRE', sub: 'where the cloud lives' },
    { href: 'loadbalancer.html', short: 'CH2 LOAD BAL', title: 'CH 2  LOAD BALANCING', sub: 'coping with demand' },
    { href: 'cdn.html',          short: 'CH3 CDN',      title: 'CH 3  CDN + EDGE', sub: 'reaching the user' }
  ];
  function currentPage () {
    var p = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return p || 'index.html';
  }

  function sessionOf (sc) {
    if (sc.xrSession) { return sc.xrSession; }
    var xr = sc.renderer && sc.renderer.xr;
    return xr && xr.getSession ? xr.getSession() : null;
  }
  XRQ.inXR = function (sc) { return sc.is('vr-mode') || sc.is('ar-mode'); };

  /* ---------- build 31c: live XR support (all pages) ------------------------------
     A-Frame asks the browser ONCE, when its script loads, whether VR/AR are supported,
     and keeps that answer. With the Immersive Web Emulator the extension can install its
     emulated headset AFTER that moment; A-Frame then remembers the PC's own answer
     (often "VR yes, AR no" with the Quest Link software installed), and every later
     enterAR() fails with "immersive-ar mode not supported" although AR works.
     Fix: ask the browser again at the moment of use, and refresh the answer a few times
     after load. A real Quest answers the same both times, so nothing changes there. */
  XRQ.support = { vr: null, ar: null };
  function refreshSupport () {
    var x = navigator.xr;
    if (!x || !x.isSessionSupported) { return Promise.resolve(XRQ.support); }
    var ask = function (m) { try { return x.isSessionSupported(m).catch(function () { return false; }); } catch (e) { return Promise.resolve(false); } };
    return Promise.all([ask('immersive-vr'), ask('immersive-ar')]).then(function (r) {
      XRQ.support.vr = !!r[0]; XRQ.support.ar = !!r[1];
      showXRButtons();
      return XRQ.support;
    });
  }
  XRQ.refreshSupport = refreshSupport;
  /* A-Frame hides its AR button when its stale flag says "no AR": show it again if the browser says yes */
  function showXRButtons () {
    var sc = document.querySelector('a-scene');
    if (!sc || XRQ.inXR(sc)) { return; }
    if (XRQ.support.ar) {
      Array.prototype.forEach.call(document.querySelectorAll('.a-enter-ar'), function (el) { el.classList.remove('a-hidden'); });
    }
    if (XRQ.support.vr) {
      Array.prototype.forEach.call(document.querySelectorAll('.a-enter-vr'), function (el) { el.classList.remove('a-hidden'); });
    }
  }
  var SceneCtor = window.customElements && customElements.get('a-scene');
  if (SceneCtor && SceneCtor.prototype && !SceneCtor.prototype.__xrqLive) {
    var SP = SceneCtor.prototype, origCheck = SP.checkHeadsetConnected, origEnterAR = SP.enterAR;
    SP.__xrqLive = true;
    SP.checkHeadsetConnected = function () {
      return origCheck.call(this) || !!XRQ.support.vr || !!XRQ.support.ar;
    };
    SP.enterAR = function () {
      var self = this;
      if (!navigator.xr || !navigator.xr.isSessionSupported) { return origEnterAR.call(this); }
      return refreshSupport().then(function (s) {
        if (!s.ar) { throw new Error('This browser or device reports no immersive-ar support right now.'); }
        return self.enterVR(true);                  /* what A-Frame's own enterAR does after its (stale) check */
      });
    };
  }
  refreshSupport();
  document.addEventListener('DOMContentLoaded', function () {
    refreshSupport();
    [1500, 4000].forEach(function (ms) { setTimeout(refreshSupport, ms); });   /* catch a late emulator */
    if (navigator.xr && navigator.xr.addEventListener) { navigator.xr.addEventListener('devicechange', refreshSupport); }
    var sc = document.querySelector('a-scene');
    if (!sc) { return; }
    /* A-Frame re-hides its buttons on enter/exit; re-apply after it */
    ['enter-vr', 'exit-vr', 'loaded'].forEach(function (ev) { sc.addEventListener(ev, function () { setTimeout(showXRButtons, 0); }); });
    /* A-Frame's AR hit-test helpers keep listening for EVERY later session start and call
       requestHitTestSourceForTransientInput, which the emulator does not implement: that throw
       broke three.js's session start, so "Back to VR" never finished. Supply a rejecting stand-in
       (A-Frame already handles a rejection). Registered at load, so it runs before A-Frame's. */
    var guard = function () {
      var xr = sc.renderer && sc.renderer.xr;
      if (!xr || xr.__xrqGuard) { return; }
      xr.__xrqGuard = true;
      xr.addEventListener('sessionstart', function () {
        var s = xr.getSession && xr.getSession();
        if (s && typeof s.requestHitTestSourceForTransientInput !== 'function') {
          s.requestHitTestSourceForTransientInput = function () {
            return Promise.reject(new Error('transient-input hit test not available in this session'));
          };
        }
      });
    };
    if (sc.renderer) { guard(); } else { sc.addEventListener('renderstart', guard); sc.addEventListener('loaded', guard); }
  });
  /* build 14: true while the user types in a text field (incl. inside shadow DOM,
     e.g. the Immersive Web Emulator's panels) - page shortcuts must ignore it. */
  XRQ.typing = function (e) {
    var t = (e && e.composedPath && e.composedPath()[0]) || (e && e.target);
    if (!t) { return false; }
    var tag = (t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
  };
  /* Headset AR (world-space) vs phone AR (screen-space). */
  XRQ.headsetAR = function (sc) {
    var s = sessionOf(sc);
    if (s && s.interactionMode) { return s.interactionMode === 'world-space'; }
    return IS_QUEST;
  };

  /* ---------- chapter switching (option A) -------------------------------- */
  var RESUME_KEY = 'xrq-resume';
  function setResume () { try { sessionStorage.setItem(RESUME_KEY, 'ar'); } catch (e) {} }
  function takeResume () {
    try { var v = sessionStorage.getItem(RESUME_KEY); sessionStorage.removeItem(RESUME_KEY); return v; }
    catch (e) { return null; }
  }
  XRQ.goChapter = function (href) {
    var sc = document.querySelector('a-scene');
    if (sc && sc.is('ar-mode')) { setResume(); }
    if (typeof window.doorGo === 'function') { window.doorGo(href); }
    else { location.href = href; }
  };
  /* Doors clicked on the AR model also keep the "continue in AR" flag. */
  window.addEventListener('load', function () {
    var orig = window.doorGo;
    if (typeof orig !== 'function' || orig.__xrq) { return; }
    var wrapped = function (href) {
      var sc = document.querySelector('a-scene');
      if (sc && sc.is('ar-mode')) { setResume(); }
      /* build 31: teleport sound on every door / chapter jump, except chapter 1's
         sliding exit, which already played its own door sound */
      if (!window.__dooring && !window.__xrqNoWhoosh && XRQ.sfx) { XRQ.sfx.whoosh(); }
      return orig.apply(this, arguments);
    };
    wrapped.__xrq = true;
    window.doorGo = wrapped;
  });

  function showResumePrompt (sc) {
    if (document.getElementById('xrq-resume')) { return; }
    var box = document.createElement('div');
    box.id = 'xrq-resume';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:300;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(11,16,32,.72);font-family:system-ui,sans-serif');
    box.innerHTML =
      '<div style="background:#131a2e;border:1px solid #22d3ee;border-radius:14px;padding:22px 26px;' +
      'text-align:center;color:#e2e8f0;max-width:340px">' +
      '<div style="font-weight:700;font-size:18px;margin-bottom:6px">You were in AR</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">Loading a new chapter ends the AR session. ' +
      'One click puts you back.</div>' +
      '<button id="xrq-resume-go" style="font:700 16px system-ui;padding:14px 22px;border-radius:10px;' +
      'border:none;background:#22d3ee;color:#0b1020;cursor:pointer;width:100%">Continue in AR</button>' +
      '<button id="xrq-resume-no" style="font:600 13px system-ui;margin-top:10px;padding:8px 14px;' +
      'border-radius:8px;border:1px solid #475569;background:transparent;color:#cbd5e1;cursor:pointer">' +
      'Stay in 2D</button></div>';
    document.body.appendChild(box);
    document.getElementById('xrq-resume-go').addEventListener('click', function () {
      box.remove();
      try {
        var p = sc.enterAR();
        if (p && p.catch) { p.catch(function (e) { console.warn('enterAR failed:', e && e.message); }); }
      } catch (e) { console.warn('enterAR failed:', e && e.message); }
    });
    document.getElementById('xrq-resume-no').addEventListener('click', function () { box.remove(); });
  }
  XRQ.maybeResume = function (sc) {
    if (takeResume() !== 'ar') { return; }
    if (!navigator.xr || !navigator.xr.isSessionSupported) { return; }
    navigator.xr.isSessionSupported('immersive-ar').then(function (ok) {
      if (ok) { showResumePrompt(sc); }
    }).catch(function () {});
  };

  /* ---------- clicking by ray (phone taps; also used by tests) ------------ */
  function isShown (o) {
    for (; o; o = o.parent) { if (!o.visible) { return false; } }
    return true;
  }
  XRQ.clickRay = function (origin, dir) {
    var targets = [];
    Array.prototype.forEach.call(document.querySelectorAll('.clickable'), function (el) {
      if (el.object3D && isShown(el.object3D)) { targets.push(el.object3D); }
    });
    var hits = new THREE.Raycaster(origin, dir.clone().normalize(), 0, 60).intersectObjects(targets, true);
    for (var i = 0; i < hits.length; i++) {
      if (!isShown(hits[i].object)) { continue; }
      var o = hits[i].object;
      while (o && !o.el) { o = o.parent; }
      var el = o && o.el;
      while (el && !(el.classList && el.classList.contains('clickable'))) { el = el.parentEl; }
      if (el) { el.emit('click', { intersection: hits[i], cursorEl: null }); return el; }
    }
    return null;
  };

  /* ---------- small 3D UI kit (ASCII-only text) --------------------------- */
  /* build 17: fixed letter width `cw` (metres per character). The text block is
     exactly as wide as the button minus a margin, so a long label wraps onto a
     second line instead of spilling into its neighbours. */
  function btn (parent, label, x, y, w, h, color, onClick, cw) {
    cw = cw || 0.016;
    var wrap = Math.max(4, Math.floor((w * 0.9) / cw));
    var e = document.createElement('a-entity');
    e.setAttribute('class', 'clickable');
    e.setAttribute('position', x + ' ' + y + ' 0.01');
    e.innerHTML =
      '<a-plane width="' + w + '" height="' + h + '" material="color: ' + color + '; shader: flat"></a-plane>' +
      '<a-text value="' + label + '" align="center" color="#e2e8f0" width="' + (wrap * cw).toFixed(3) +
      '" wrap-count="' + wrap + '" position="0 0 0.006" material="shader: flat"></a-text>';
    e.addEventListener('click', function (ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } onClick(); });
    e.addEventListener('mouseenter', function () {
      var p = e.querySelector('a-plane'); if (p) { p.setAttribute('material', 'color', '#2b4a6b'); }
    });
    e.addEventListener('mouseleave', function () {
      var p = e.querySelector('a-plane'); if (p) { p.setAttribute('material', 'color', color); }
    });
    parent.appendChild(e);
    return e;
  }
  function label (parent, text, x, y, width, color) {
    var t = document.createElement('a-text');
    t.setAttribute('value', text); t.setAttribute('align', 'center');
    t.setAttribute('color', color || '#22d3ee'); t.setAttribute('width', width);
    t.setAttribute('position', x + ' ' + y + ' 0.01'); t.setAttribute('material', 'shader: flat');
    parent.appendChild(t);
    return t;
  }

  /* ---------- build 34: phone AR placement + anchors ------------------------
     Phones (not headsets): a ring follows the floor / table the phone points
     at, a tap drops the model there, and a WebXR anchor keeps it fixed to the
     real room (without one, ARCore's map corrections make content drift). */
  XRQ.phoneAR = function (sc) { return !!(sc && sc.is('ar-mode') && !XRQ.headsetAR(sc)); };
  var RING_URL = null;
  XRQ.ringURL = function () {
    if (RING_URL) { return RING_URL; }
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.strokeStyle = '#22d3ee'; g.lineWidth = 16; g.beginPath(); g.arc(128, 128, 104, 0, 6.2832); g.stroke();
    g.globalAlpha = 0.35; g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(128, 128, 96, 0, 6.2832); g.fill();
    g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 14, 0, 6.2832); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ffffff';
    [[128, 18, 128, 58], [128, 198, 128, 238], [18, 128, 58, 128], [198, 128, 238, 128]].forEach(function (l) {
      g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke();
    });
    RING_URL = c.toDataURL('image/png');
    return RING_URL;
  };
  /* ask for hit-test + anchors in AR sessions on phones only (the Quest sessions stay as they were) */
  XRQ.wantARFeatures = function (sc, overlayEl) {
    if (IS_QUEST || !sc) { return; }
    var w = sc.getAttribute('webxr');                  /* same pattern as A-Frame's own 'anchored' component */
    if (!w || !Array.isArray(w.optionalFeatures)) { return; }
    var changed = false, want = ['hit-test', 'anchors'];
    if (overlayEl) { want.push('dom-overlay'); }
    want.forEach(function (f) { if (w.optionalFeatures.indexOf(f) < 0) { w.optionalFeatures.push(f); changed = true; } });
    if (overlayEl && w.overlayElement !== overlayEl) { w.overlayElement = overlayEl; changed = true; }
    if (changed) { sc.setAttribute('webxr', w); }
  };
  /* Keeps an object fixed to the real room: step() returns how far (world metres)
     the anchor moved since the last frame; the caller shifts its object by that. */
  XRQ.Anchor = function (sc) {
    this.sc = sc; this.anchor = null; this.want = null; this.busy = false; this.gen = 0;
    this.last = new THREE.Vector3(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion();
  };
  XRQ.Anchor.prototype.set = function (worldPos) { this.clear(); this.want = worldPos.clone(); this.moved = 0; XRQ.anchorState = 'creating'; };
  XRQ.Anchor.prototype.clear = function () {
    if (this.anchor && this.anchor.delete) { try { this.anchor.delete(); } catch (e) { /* already gone */ } }
    this.anchor = null; this.want = null; this.gen++;
  };
  XRQ.Anchor.prototype.step = function () {
    var sc = this.sc, fr = sc.frame, xr = sc.renderer && sc.renderer.xr;
    var ref = xr && xr.getReferenceSpace && xr.getReferenceSpace();
    if (!fr || !ref || !sc.is('ar-mode')) { return null; }
    var par = sc.camera && sc.camera.parent;
    if (this.want && !this.busy) {
      var p = this.want.clone(), self = this, gen = this.gen;
      this.want = null;
      if (typeof fr.createAnchor !== 'function' || typeof XRRigidTransform === 'undefined') {
        XRQ.anchorState = 'not supported'; return null;
      }
      if (par) { par.updateMatrixWorld(true); p.applyMatrix4(this.m.copy(par.matrixWorld).invert()); }   /* world -> XR space */
      this.busy = true;
      try {
        fr.createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }), ref).then(function (a) {
          self.busy = false;
          if (gen !== self.gen) { try { a.delete(); } catch (e) { /* ignore */ } return; }
          self.anchor = a; self.last.copy(p); XRQ.anchorState = 'anchored';
        }, function (e) { self.busy = false; XRQ.anchorState = 'failed: ' + (e && e.message || e); });
      } catch (e) { this.busy = false; XRQ.anchorState = 'failed: ' + (e && e.message || e); }
      return null;
    }
    if (!this.anchor) { return null; }
    var pose = fr.getPose(this.anchor.anchorSpace, ref);
    if (!pose) { return null; }                                   /* tracking lost this frame */
    var t = pose.transform.position, d = new THREE.Vector3(t.x - this.last.x, t.y - this.last.y, t.z - this.last.z);
    this.last.set(t.x, t.y, t.z);
    if (par) { par.getWorldQuaternion(this.q); d.applyQuaternion(this.q); }     /* XR space -> world */
    this.moved = (this.moved || 0) + d.length();
    return d;
  };
  /* small text card that rides 0.7 m in front of the phone camera (phone AR has no HTML overlay here) */
  XRQ.arHint = function (sc, text) {
    var bar = document.getElementById('xrq-arbar');
    if (bar && bar.classList.contains('on')) {          /* build 35: phones show it in the on-screen bar */
      var m = document.getElementById('xrq-armsg'); if (m) { m.textContent = text || ''; }
      return;
    }
    var h = document.getElementById('xrq-arhint');
    var cam = sc.querySelector('[camera]');
    if (!h && cam) {
      h = document.createElement('a-entity'); h.setAttribute('id', 'xrq-arhint');
      h.setAttribute('position', '0 -0.17 -0.75');
      h.innerHTML = '<a-plane width="0.62" height="0.11" material="color: #0b1220; shader: flat; opacity: 0.82; transparent: true"></a-plane>' +
        '<a-text align="center" width="0.6" wrap-count="40" color="#e2f3ff" position="0 0 0.002" value=""></a-text>';
      cam.appendChild(h);
    }
    if (!h) { return; }
    if (!text) { h.setAttribute('visible', false); return; }
    h.setAttribute('visible', true);
    var t = h.querySelector('a-text'); if (t) { t.setAttribute('value', text); }
  };
  /* bounds of the visible parts only (hidden walls, mirrored floor reflections etc. do not count) */
  function visibleBox (root) {
    var box = new THREE.Box3(), tmp = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverseVisible(function (o) {
      if (!o.isMesh || !o.geometry) { return; }
      var mt = o.material;                     /* glows, halos and shadows do not count as size */
      if (mt && !Array.isArray(mt) && (mt.depthWrite === false || mt.blending === THREE.AdditiveBlending ||
          (mt.transparent && mt.opacity < 0.6))) { return; }
      if (!o.geometry.boundingBox) { o.geometry.computeBoundingBox(); }
      if (o.isInstancedMesh) { tmp.setFromObject(o); } else { tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
      if (isFinite(tmp.min.x)) { box.union(tmp); }
    });
    return box;
  }
  XRQ.visibleBox = visibleBox;

  /* build 35: phone AR controls as an on-screen HTML bar (WebXR DOM overlay), like chapter 3.
     3D panels floating in the room were hard to hit with a screen tap and drifted out of reach. */
  function buildArBar (comp) {
    if (document.getElementById('xrq-arbar')) { return document.getElementById('xrq-arbar'); }
    var css = document.createElement('style');
    css.textContent =
      '#xrq-arbar{position:fixed;inset:0;display:none;pointer-events:none;z-index:90;font:600 13px system-ui,sans-serif;color:#e2e8f0}' +
      '#xrq-arbar.on{display:block}' +
      '#xrq-arbar .bx{position:absolute;left:8px;right:8px;bottom:10px;pointer-events:auto;background:rgba(11,18,32,.80);' +
      'border:1px solid rgba(34,211,238,.35);border-radius:12px;padding:8px}' +
      '#xrq-arbar .st{font-size:12px;color:#7dd3fc;margin:0 2px 2px}' +
      '#xrq-arbar .msg{font-size:13px;color:#f8fafc;margin:0 2px 6px;min-height:16px}' +
      '#xrq-arbar .row{display:flex;gap:6px;margin-top:6px}' +
      '#xrq-arbar button{flex:1;font:700 12.5px system-ui,sans-serif;color:#e2e8f0;background:#1e2a44;border:1px solid #334155;' +
      'border-radius:8px;padding:10px 4px;min-height:40px}' +
      '#xrq-arbar button.here{background:#334155;color:#94a3b8}' +
      '#xrq-arbar button.exit{background:#5b1f2a;border-color:#7f1d1d}' +
      /* build 40: guided tour in phone AR */
      '#xrq-arbar button.tourgo{background:#0e7490;border-color:#22d3ee;color:#ecfeff}' +
      '#xrq-arbar .tour{display:none}' +
      '#xrq-arbar.touring .tour{display:block}' +
      '#xrq-arbar.touring .ctl,#xrq-arbar.touring .msg{display:none!important}' +
      '#xrq-arbar .tstep{font-size:10.5px;letter-spacing:.14em;color:#fbbf24;margin:0 2px}' +
      '#xrq-arbar .ttl{font-size:14px;color:#fff;margin:2px 2px 3px}' +
      '#xrq-arbar .ttx{font:500 12.5px/1.4 system-ui,sans-serif;color:#dbe4f3;margin:0 2px;max-height:26vh;overflow-y:auto}' +
      '#xrq-arbar button.next{background:#0e7490;border-color:#22d3ee}';
    document.head.appendChild(css);
    var here = currentPage(), bar = document.createElement('div');
    bar.id = 'xrq-arbar';
    bar.innerHTML = '<div class="bx"><div class="st" id="xrq-arst"></div><div class="msg" id="xrq-armsg"></div>' +
      '<div class="tour" id="xrq-artour"><div class="tstep" id="xrq-arts"></div><div class="ttl" id="xrq-artt"></div>' +
      '<div class="ttx" id="xrq-artx"></div><div class="row"><button data-t="back">&larr; BACK</button>' +
      '<button class="next" data-t="next" id="xrq-artn">NEXT &rarr;</button><button class="exit" data-t="end">END TOUR</button></div></div>' +
      '<div class="row ctl" id="xrq-artourrow" style="display:none"><button class="tourgo" data-t="start">&#9654; GUIDED TOUR (learn step by step)</button></div>' +
      '<div class="row ctl"><button data-a="smaller">SIZE -</button><button data-a="bigger">SIZE +</button>' +
      '<button data-a="left">TURN &lt;</button><button data-a="right">TURN &gt;</button><button data-a="move">MOVE</button></div>' +
      '<div class="row ctl">' + CHAPTERS.map(function (c) {
        return '<button data-go="' + c.href + '"' + (c.href === here ? ' class="here"' : '') + '>' + c.short.replace(/ .*/, '') + '</button>';
      }).join('') + '<button class="exit" data-a="exit">EXIT AR</button></div></div>';
    document.body.appendChild(bar);
    /* taps on the bar must not also reach the AR scene as a "select" */
    bar.addEventListener('beforexrselect', function (e) { e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) { return; }
      var a = b.getAttribute('data-a'), go = b.getAttribute('data-go'), sc = comp.el;
      var t = b.getAttribute('data-t');
      if (t) { comp.tourAct(t); return; }
      if (go) { if (go !== here) { XRQ.goChapter(go); } return; }
      if (a === 'smaller') { comp.resize(1 / 1.25); }
      if (a === 'bigger') { comp.resize(1.25); }
      if (a === 'left') { comp.rotate(1); }
      if (a === 'right') { comp.rotate(-1); }
      if (a === 'move') { comp.startScan(); }
      if (a === 'exit') { sc.exitVR(); }
    });
    return bar;
  }

  /* build 40: pulsing highlight rings inside a model (they scale with it).
     XRQ.arMarks(rootEl, [{ p: [x, y, z], r: radius, h: beam height }], colour); [] clears. */
  XRQ.arMarks = function (rootEl, list, colour) {
    if (!rootEl) { return; }
    var pool = rootEl.__xrqMarks || (rootEl.__xrqMarks = []);
    list = list || [];
    for (var i = 0; i < Math.max(pool.length, list.length); i++) {
      var m = pool[i], d = list[i];
      if (!m && d) {
        m = document.createElement('a-entity');
        m.innerHTML =
          '<a-ring radius-inner="0.86" radius-outer="1" rotation="-90 0 0" position="0 0.06 0" ' +
          'material="shader: flat; side: double; transparent: true; opacity: 0.95" ' +
          'animation="property: scale; from: 0.85 0.85 0.85; to: 1.18 1.18 1.18; dir: alternate; loop: true; dur: 850; easing: easeInOutSine"></a-ring>' +
          '<a-cylinder radius="0.05" height="1" position="0 0.5 0" material="shader: flat; transparent: true; opacity: 0.6"></a-cylinder>' +
          '<a-sphere radius="0.16" position="0 1 0" material="shader: flat" ' +
          'animation="property: scale; from: 0.7 0.7 0.7; to: 1.4 1.4 1.4; dir: alternate; loop: true; dur: 700"></a-sphere>';
        rootEl.appendChild(m); pool[i] = m;
      }
      if (!m) { continue; }
      if (!d) { m.setAttribute('visible', false); continue; }
      var r = d.r || 1, h = d.h || 3, col = d.c || colour || '#22d3ee';
      m.setAttribute('position', d.p[0] + ' ' + d.p[1] + ' ' + d.p[2]);
      m.setAttribute('visible', true);
      var ring = m.querySelector('a-ring'), beam = m.querySelector('a-cylinder'), ball = m.querySelector('a-sphere');
      if (ring) { ring.setAttribute('radius-inner', (r * 0.86).toFixed(3)); ring.setAttribute('radius-outer', r.toFixed(3)); ring.setAttribute('color', col); }
      if (beam) { beam.setAttribute('height', h); beam.setAttribute('position', '0 ' + (h / 2) + ' 0'); beam.setAttribute('radius', Math.max(0.04, r * 0.05).toFixed(3)); beam.setAttribute('color', col); }
      if (ball) { ball.setAttribute('position', '0 ' + h + ' 0'); ball.setAttribute('radius', Math.max(0.12, r * 0.14).toFixed(3)); ball.setAttribute('color', col); }
    }
  };

  /* ---------- AR model / lobby / custom ----------------------------------- */
  AFRAME.registerComponent('ar-model', {
    schema: {
      mode: { default: 'model', oneOf: ['model', 'lobby', 'custom'] },
      root: { default: '#world' },
      scale: { default: 0.045 },     /* model size: 0.045 x 24 m hall = 1.1 m */
      table: { default: 0.7 },       /* model floor height above the real floor (m) */
      dist: { default: 1.4 },        /* model centre distance in front of you (m) */
      tap: { default: true }         /* phone: ray-cast screen taps */
    },
    init: function () {
      var self = this, sc = this.el;
      this.active = false; this.k = 1; this.yaw = 0;
      this.target = new THREE.Vector3(); this.centre = new THREE.Vector3(); this.minY = 0;
      this.onSelect = this.onSelect.bind(this);
      this.keeper = new XRQ.Anchor(sc); this.scanning = false;
      if (this.data.mode === 'model' && !IS_QUEST) {                 /* build 34: phone aim ring + anchor */
        this.bar = buildArBar(this);                                  /* build 35: on-screen controls */
        XRQ.wantARFeatures(sc, this.bar);
        if (!sc.hasAttribute('ar-hit-test')) {
          sc.setAttribute('ar-hit-test', { type: 'map', src: XRQ.ringURL(), mapSize: { x: 0.35, y: 0.35 }, enabled: false });
        }
        sc.addEventListener('ar-hit-test-achieved', function () {
          if (self.scanning) { self.found = true; XRQ.arHint(sc, 'Surface found: tap to put the model on the ring'); }
        });
        sc.addEventListener('ar-hit-test-select-start', function (e) {
          if (self.scanning && e.detail && e.detail.position) {
            self.ringPos = e.detail.position.clone(); self.ringAt = Date.now();
            self.ringQ = e.detail.orientation ? e.detail.orientation.clone() : null;     /* the ring's own surface */
          }
        });
        sc.addEventListener('ar-hit-test-select', function (e) { self.onHitSelect(e.detail || {}); });
      }
      sc.addEventListener('enter-vr', function () { if (sc.is('ar-mode')) { self.start(); } });
      sc.addEventListener('exit-vr', function () { self.stop(); });
      var ready = function () { self.buildPanel(); XRQ.maybeResume(sc); };
      if (sc.hasLoaded) { ready(); } else { sc.addEventListener('loaded', ready); }
      XRQ.ar = this;
    },

    /* ---- panel ---- */
    buildPanel: function () {
      var self = this, sc = this.el, d = this.data, here = currentPage();
      var P = this.panel = document.createElement('a-entity');
      P.setAttribute('id', 'xrq-arpanel');
      P.setAttribute('visible', 'false');
      if (d.mode === 'lobby') {
        P.innerHTML = '<a-plane width="1.5" height="0.82" material="color: #131a2e; shader: flat; opacity: 0.94"></a-plane>';
        label(P, 'CHOOSE A CHAPTER', 0, 0.33, 1.6);
        CHAPTERS.slice(1).forEach(function (c, i) {
          var x = -0.48 + i * 0.48;
          var card = btn(P, c.title, x, 0.08, 0.44, 0.36, '#1e2a44', function () { XRQ.goChapter(c.href); }, 0.026);
          label(card, c.sub, 0, -0.11, 0.5, '#94a3b8');
        });
        btn(P, 'EXIT AR', 0, -0.3, 0.4, 0.1, '#5b1f2a', function () { sc.exitVR(); });
      } else {
        P.innerHTML = '<a-plane width="0.98" height="0.5" material="color: #131a2e; shader: flat; opacity: 0.94"></a-plane>';
        label(P, 'AR MODEL', 0, 0.21, 1.1);
        var row = [['SIZE -', function () { self.resize(1 / 1.25); }],
                   ['SIZE +', function () { self.resize(1.25); }],
                   ['TURN <', function () { self.rotate(1); }],
                   ['TURN >', function () { self.rotate(-1); }],
                   [IS_QUEST ? 'BRING HERE' : 'MOVE', function () { self.place(); }]];
        row.forEach(function (r, i) { btn(P, r[0], -0.38 + i * 0.19, 0.1, 0.175, 0.08, '#1e2a44', r[1]); });
        label(P, 'GO TO', 0, 0.015, 0.9, '#94a3b8');
        CHAPTERS.forEach(function (c, i) {
          var me = c.href === here;
          /* the chapter you are in is greyed out instead of marked with text */
          btn(P, c.short, -0.36 + i * 0.24, -0.07, 0.225, 0.08,
              me ? '#334155' : '#1e2a44', function () { if (!me) { XRQ.goChapter(c.href); } });
        });
        btn(P, 'EXIT AR', 0, -0.18, 0.3, 0.075, '#5b1f2a', function () { sc.exitVR(); });
      }
      sc.appendChild(P);
    },

    /* ---- session ---- */
    start: function () {
      var self = this, sc = this.el, d = this.data;
      if (this.active) { return; }
      this.active = true;
      XRQ.arModel = true;
      var root = this.root = document.querySelector(d.root);
      if (d.mode === 'model' && root) {
        var o = root.object3D;
        this.saved = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
        /* model bounds in the root's own coordinates (root is at identity now) */
        this.measure();
        this.k = 1;
      }
      if (d.mode === 'lobby' && root) { this.lobbyVis = root.object3D.visible; root.object3D.visible = false; }
      /* chapter control walls that live inside the model come out to full size */
      var vm = document.getElementById('vrmenu');
      this.vmSaved = null; this.vmParent = null;
      if (vm && d.mode !== 'lobby') {
        this.vmSaved = { p: vm.object3D.position.clone(), r: vm.object3D.rotation.clone(), s: vm.object3D.scale.clone() };
        if (vm.object3D.parent !== sc.object3D) { this.vmParent = vm.object3D.parent; sc.object3D.attach(vm.object3D); }
        vm.object3D.scale.setScalar(0.7);   /* smaller in AR: less of the real room hidden */
      }
      if (d.tap) {
        var s = sessionOf(sc);
        if (s && !XRQ.headsetAR(sc) && s.addEventListener) { this.tapSession = s; s.addEventListener('select', this.onSelect); }
      }
      /* cdn.html (custom) places its own globe; on phones it keeps its HTML buttons */
      this.phone = d.mode === 'model' && XRQ.phoneAR(sc);
      var showPanel = !(d.mode === 'custom' && !XRQ.headsetAR(sc)) && !this.phone;   /* phones: on-screen bar instead */
      if (this.phone && this.bar) { this.bar.classList.add('on'); }
      if (this.phone) { this.startScan(); }
      var go = function () {
        if (!self.active) { return; }
        if (d.mode === 'model' && !self.phone) { self.place(); }
        if (self.panel && showPanel) {
          self.panel.object3D.visible = true;
          if (d.mode === 'lobby') { XRQ.faceUser(self.panel, 1.5, 1.3, 0); }
          else { XRQ.faceUser(self.panel, 1.0, 1.0, 0.85); }
        }
        var vm2 = document.getElementById('vrmenu');
        if (vm2 && d.mode !== 'lobby' && !self.phone) { vm2.object3D.visible = true; XRQ.faceUser(vm2, 2.3, 1.7, -0.15); }
        if (vm2 && self.phone) { vm2.object3D.visible = false; }
      };
      go();
      setTimeout(go, 600);    /* head pose reaches the camera after the first XR frame */
    },
    stop: function () {
      var sc = this.el, d = this.data;
      if (!this.active) { return; }
      this.active = false;
      XRQ.arModel = false;
      this.tourEnd();
      this.keeper.clear(); this.scanning = false;
      if (this.bar) { this.bar.classList.remove('on'); }
      if (sc.hasAttribute('ar-hit-test')) { sc.setAttribute('ar-hit-test', 'enabled', false); }
      XRQ.arHint(sc, '');
      if (this.root) { this.root.object3D.visible = true; }
      if (this.panel) { this.panel.object3D.visible = false; }
      if (this.tapSession) { this.tapSession.removeEventListener('select', this.onSelect); this.tapSession = null; }
      if (d.mode === 'model' && this.root && this.saved) {
        var o = this.root.object3D;
        o.position.copy(this.saved.p); o.rotation.copy(this.saved.r); o.scale.copy(this.saved.s);
      }
      if (d.mode === 'lobby' && this.root) { this.root.object3D.visible = this.lobbyVis !== false; }
      var vm = document.getElementById('vrmenu');
      if (vm && this.vmSaved) {
        if (this.vmParent) { this.vmParent.add(vm.object3D); this.vmParent = null; }
        vm.object3D.position.copy(this.vmSaved.p); vm.object3D.rotation.copy(this.vmSaved.r);
        vm.object3D.scale.copy(this.vmSaved.s);
        this.vmSaved = null;
      }
    },

    /* ---- model placement ---- */
    /* model bounds in the root's own (identity) frame, visible parts only */
    measure: function () {
      if (!this.root || !this.saved) { return; }
      var o = this.root.object3D, P = o.position.clone(), R = o.rotation.clone(), S = o.scale.clone(), V = o.visible;
      o.position.copy(this.saved.p); o.rotation.copy(this.saved.r); o.scale.copy(this.saved.s); o.visible = true;
      var box = visibleBox(o);
      if (!box.isEmpty()) { box.getCenter(this.centre); this.minY = box.min.y; }
      o.position.copy(P); o.rotation.copy(R); o.scale.copy(S); o.visible = V;
    },
    /* phone: hide the model, show the ring, wait for a tap */
    startScan: function () {
      var sc = this.el;
      this.tourEnd();
      this.keeper.clear();
      this.scanning = true; this.found = false; this.ringPos = null; this.scanSince = Date.now();
      if (this.root) { this.root.object3D.visible = false; }
      if (sc.hasAttribute('ar-hit-test')) { sc.setAttribute('ar-hit-test', 'enabled', true); }
      XRQ.arHint(sc, 'Point at the floor or a table until the ring appears, then tap');
    },
    onHitSelect: function (det) {
      if (!this.active || !this.scanning) { return; }
      /* drop it on the ring (where the phone points), not under the finger */
      var useRing = this.ringPos && Date.now() - this.ringAt < 2500;
      var p = useRing ? this.ringPos : det.position, q = useRing ? (this.ringQ || det.orientation) : det.orientation;
      /* the hit pose's Y axis is the surface normal (measured on a phone in build 13): skip walls */
      if (q) {
        var up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        if (Math.abs(up.y) < 0.75) { this.say('That is a wall. Aim at the floor or a table and tap'); return; }
      }
      if (p) { this.placeAt(p); }
    },
    placeAt: function (p) {
      var sc = this.el, cam = sc.camera;
      this.measure();
      var head = new THREE.Vector3(); if (cam) { cam.getWorldPosition(head); }
      var f = new THREE.Vector3(p.x - head.x, 0, p.z - head.z);
      if (f.lengthSq() < 1e-6) { f.set(0, 0, -1); } f.normalize();
      this.yaw = Math.atan2(-f.x, -f.z);                 /* far end of the model points away from you */
      this.target.set(p.x, p.y, p.z);
      this.apply();
      this.scanning = false;
      if (sc.hasAttribute('ar-hit-test')) { sc.setAttribute('ar-hit-test', 'enabled', false); }
      if (this.root) { this.root.object3D.visible = true; }
      this.keeper.set(this.target);
      if (this.bar && this.bar.classList.contains('on')) { this.say('Placed. Walk around it; it should stay put.'); }
      else {
        XRQ.arHint(sc, 'Placed. Tap the model to use it. MOVE on the panel puts it somewhere else');
        var self = this; clearTimeout(this.hintT);
        this.hintT = setTimeout(function () { if (!self.scanning) { XRQ.arHint(sc, ''); } }, 4000);
      }
    },
    say: function (text) { this.msgUntil = Date.now() + 3500; XRQ.arHint(this.el, text); },

    /* ---- build 40: guided tour in phone AR --------------------------------
       The page supplies window.XRQ_ARTOUR = { steps: [{ title, text, say }],
       show(i), clear() }. Only the tour is offered in AR: one fixed path, the
       model highlights each part, the card shows the text, the voice the summary. */
    tourAvail: function () {
      var T = window.XRQ_ARTOUR;
      return !!(T && T.steps && T.steps.length && this.phone && this.bar);
    },
    tourAct: function (t) {
      var T = window.XRQ_ARTOUR; if (!T) { return; }
      if (t === 'start') {
        if (this.scanning) { this.say('Place the model first: aim at the floor or a table and tap'); return; }
        this.tourGo(0); return;
      }
      if (t === 'next') { if (this.tourI >= T.steps.length - 1) { this.tourEnd(); } else { this.tourGo(this.tourI + 1); } return; }
      if (t === 'back') { if (this.tourI > 0) { this.tourGo(this.tourI - 1); } return; }
      if (t === 'end') { this.tourEnd(); }
    },
    tourGo: function (i) {
      var T = window.XRQ_ARTOUR; if (!T || !this.bar) { return; }
      var st = T.steps[i]; if (!st) { return; }
      this.tourI = i;
      this.bar.classList.add('touring');
      var set = function (id, v) { var e = document.getElementById(id); if (e) { e.textContent = v; } };
      set('xrq-arts', 'STEP ' + (i + 1) + ' / ' + T.steps.length);
      set('xrq-artt', st.title);
      set('xrq-artx', st.text);
      set('xrq-artn', i === T.steps.length - 1 ? 'FINISH \u2713' : 'NEXT \u2192');
      try { if (T.show) { T.show(i); } } catch (e) { console.warn('AR tour step', i, e); }
      if (XRQ.say) { XRQ.say(st.say || (st.title + '. ' + st.text)); }
      XRQ.arTourStep = i;
    },
    tourEnd: function () {
      var T = window.XRQ_ARTOUR;
      if (this.tourI === undefined || this.tourI < 0) { return; }
      this.tourI = -1; XRQ.arTourStep = -1;
      if (this.bar) { this.bar.classList.remove('touring'); }
      try { if (T && T.clear) { T.clear(); } } catch (e) { /* ignore */ }
      if (XRQ.hush) { XRQ.hush(); }
    },
    tick: function () {
      if (!this.active || !this.phone) { return; }
      if (!this.scanning) {
        var dlt = this.keeper.step();
        if (dlt && dlt.lengthSq() > 1e-12) { this.target.add(dlt); this.apply(); }
      }
      var now = Date.now();
      if (this.bar && now - (this.stAt || 0) > 400) {           /* status line: what the phone is doing right now */
        this.stAt = now;
        var st = document.getElementById('xrq-arst'), txt;
        if (this.scanning) { txt = this.found ? 'Surface found' : 'Looking for a surface...'; }
        else {
          var as = XRQ.anchorState || 'waiting';
          txt = 'Placed | anchor: ' + (as === 'anchored' ? 'OK' : as) +
                (this.keeper.moved > 0.005 ? ' | corrected ' + Math.round(this.keeper.moved * 100) + ' cm' : '');
        }
        if (st) { st.textContent = txt; }
        var row = document.getElementById('xrq-artourrow');
        if (row) { row.style.display = this.tourAvail() && !this.scanning ? 'flex' : 'none'; }
        if (now > (this.msgUntil || 0)) {
          var m = this.scanning ? (this.found ? 'Tap anywhere to put the model on the ring' :
                  'Point the phone at the floor or a table and move it slowly until the ring appears') :
                  (this.tourAvail() ? 'Press GUIDED TOUR to learn this chapter step by step. MOVE puts the model somewhere else.' :
                  'Tap a gate or a machine on the model. MOVE puts it somewhere else.');
          XRQ.arHint(this.el, m);
        }
      }
    },
    place: function () {
      var d = this.data, cam = this.el.camera;
      if (d.mode === 'custom') { var H = window.XRQ_HOOKS; if (H && H.here) { H.here(); } return; }
      if (d.mode !== 'model' || !this.root || !cam) { return; }
      if (this.phone && this.active) { this.startScan(); return; }      /* phone: MOVE = aim + tap again */
      this.measure();
      var head = new THREE.Vector3(), f = new THREE.Vector3();
      cam.getWorldPosition(head); cam.getWorldDirection(f);
      f.y = 0; if (f.lengthSq() < 1e-6) { f.set(0, 0, -1); } f.normalize();
      this.yaw = Math.atan2(-f.x, -f.z);          /* the model's far end points where you look */
      this.target.set(head.x + f.x * d.dist, d.table, head.z + f.z * d.dist);
      this.apply();
    },
    apply: function () {
      var o = this.root.object3D, s = this.data.scale * this.k;
      var c = new THREE.Vector3(this.centre.x * s, this.minY * s, this.centre.z * s)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      o.scale.setScalar(s);
      o.rotation.set(0, this.yaw, 0);
      o.position.set(this.target.x - c.x, this.target.y - c.y, this.target.z - c.z);
    },
    resize: function (f) {
      if (this.data.mode === 'custom') {
        var H = window.XRQ_HOOKS; if (H) { (f > 1 ? H.bigger : H.smaller)(); } return;
      }
      if (this.data.mode !== 'model' || !this.root) { return; }
      this.k = Math.min(4, Math.max(0.25, this.k * f));
      this.apply();
    },
    rotate: function (sign) {
      if (this.data.mode === 'custom') {
        var H = window.XRQ_HOOKS; if (H) { (sign > 0 ? H.turnLeft : H.turnRight)(); } return;
      }
      if (this.data.mode !== 'model' || !this.root) { return; }
      this.yaw += sign * Math.PI / 6;
      this.apply();
    },

    /* ---- phone: screen tap -> ray -> click ---- */
    onSelect: function (ev) {
      var sc = this.el, xr = sc.renderer && sc.renderer.xr;
      if (!ev || !ev.frame || !ev.inputSource || ev.inputSource.targetRayMode !== 'screen') { return; }
      if (this.scanning) {
        /* no surface after 8 s: a tap puts it on the floor 1.2 m in front */
        if (!this.found && Date.now() - this.scanSince > 8000 && sc.camera) {
          var hd = new THREE.Vector3(), fw = new THREE.Vector3();
          sc.camera.getWorldPosition(hd); sc.camera.getWorldDirection(fw); fw.y = 0;
          if (fw.lengthSq() < 1e-6) { fw.set(0, 0, -1); } fw.normalize();
          this.placeAt(new THREE.Vector3(hd.x + fw.x * 1.2, 0, hd.z + fw.z * 1.2));
        } else if (!this.found) {
          this.say('Still looking for a surface: move the phone slowly over the floor');
        }
        return;
      }
      var ref = xr && xr.getReferenceSpace && xr.getReferenceSpace();
      var pose = ref && ev.frame.getPose(ev.inputSource.targetRaySpace, ref);
      if (!pose) { return; }
      var m = new THREE.Matrix4().fromArray(pose.transform.matrix);
      var parent = sc.camera && sc.camera.parent;
      if (parent) { parent.updateMatrixWorld(true); m.premultiply(parent.matrixWorld); }
      var o = new THREE.Vector3().setFromMatrixPosition(m);
      var dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
      XRQ.clickRay(o, dir);
    }
  });

  /* ---------- locomotion -------------------------------------------------- */
  function handOf (el) {
    var c = el && el.components;
    if (!c) { return null; }
    var names = ['laser-controls', 'meta-touch-controls', 'oculus-touch-controls', 'hand-controls'];
    for (var i = 0; i < names.length; i++) {
      if (c[names[i]] && c[names[i]].data && c[names[i]].data.hand) { return c[names[i]].data.hand; }
    }
    return null;
  }

  AFRAME.registerComponent('thumbstick-locomotion', {
    schema: { speed: { default: 2.4 }, turn: { default: 30 }, dead: { default: 0.15 } },
    init: function () {
      var self = this;
      this.ev = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
      this.armed = true;
      this.fwd = new THREE.Vector3(); this.side = new THREE.Vector3(); this.head = new THREE.Vector3();
      this.el.sceneEl.addEventListener('thumbstickmoved', function (e) {
        var h = handOf(e.target);
        if (h === 'left' || h === 'right') {
          self.ev[h] = { x: +e.detail.x || 0, y: +e.detail.y || 0 };
        }
      });
      this.el.sceneEl.addEventListener('exit-vr', function () {
        self.ev.left = { x: 0, y: 0 }; self.ev.right = { x: 0, y: 0 }; self.armed = true;
      });
    },
    /* Raw WebXR gamepads (xr-standard mapping: thumbstick = axes 2,3). */
    read: function () {
      var out = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } }, found = false;
      var s = sessionOf(this.el.sceneEl);
      var list = (s && s.inputSources) || [];
      for (var i = 0; i < list.length; i++) {
        var src = list[i], gp = src && src.gamepad;
        if (!gp || !gp.axes || src.hand) { continue; }
        var h = src.handedness === 'left' ? 'left' : 'right';
        var a = gp.axes, ix = a.length >= 4 ? 2 : 0;
        var x = a[ix] || 0, y = a[ix + 1] || 0;
        if (a.length >= 4 && !x && !y) { x = a[0] || 0; y = a[1] || 0; }
        out[h] = { x: x, y: y }; found = true;
      }
      if (found) { XRQ.source = 'webxr-gamepad'; return out; }
      XRQ.source = 'aframe-event';
      return this.ev;
    },
    tick: function (t, dt) {
      var sc = this.el.sceneEl;
      if (!XRQ.inXR(sc)) { return; }
      var tp = this.el.components.teleport;
      if (tp && tp.active) { return; }
      var cam = sc.camera; if (!cam) { return; }
      var st = this.read(); XRQ.stick = st;
      var rx = st.right.x, flick = 0;
      if (Math.abs(rx) > 0.7) { if (this.armed) { this.armed = false; flick = rx > 0 ? -1 : 1; } }
      else if (Math.abs(rx) < 0.3) { this.armed = true; }
      if (XRQ.arModel) {                 /* AR: walk for real; right stick turns the model */
        if (flick && XRQ.ar) { XRQ.ar.rotate(flick); }
        return;
      }
      var d = Math.min(dt || 16, 100) / 1000, rig = this.el.object3D;
      var L = st.left, m = Math.hypot(L.x, L.y), dz = this.data.dead;
      if (m > dz) {
        cam.getWorldDirection(this.fwd);          /* three.js camera: true look direction */
        this.fwd.y = 0;
        if (this.fwd.lengthSq() < 1e-6) { this.fwd.set(0, 0, -1); }
        this.fwd.normalize();
        this.side.set(-this.fwd.z, 0, this.fwd.x);
        var k = this.data.speed * d * Math.min(1, (m - dz) / (1 - dz)) / m;
        rig.position.addScaledVector(this.fwd, -L.y * k).addScaledVector(this.side, L.x * k);
        rig.position.y = 0;
        this.clamp(rig.position);
      }
      if (flick) { this.snap(flick, cam); }
    },
    /* Rotate the rig about the HEAD, so a snap turn never shifts you sideways. */
    snap: function (sign, cam) {
      var a = sign * this.data.turn * Math.PI / 180, rig = this.el.object3D, p = rig.position;
      cam.getWorldPosition(this.head);
      var dx = p.x - this.head.x, dz = p.z - this.head.z, c = Math.cos(a), s = Math.sin(a);
      p.x = this.head.x + dx * c + dz * s;
      p.z = this.head.z - dx * s + dz * c;
      rig.rotation.y += a;
      this.clamp(p);
    },
    clamp: function (p) {
      var rw = this.el.components['rig-walk'];
      if (!rw) { return; }
      var b = rw.data.bound, r = rw.data.rbound;
      if (b > 0) { p.x = Math.max(-b, Math.min(b, p.x)); p.z = Math.max(-b, Math.min(b, p.z)); }
      if (r > 0) {
        var len = Math.hypot(p.x, p.z);
        if (len > r) { p.x *= r / len; p.z *= r / len; }
      }
    }
  });

  /* ---------- build 15: laser hover highlight on every control-wall button ---
     The laser cursor emits mouseenter/mouseleave; before this, the in-VR
     buttons never changed, so you could not tell what you were pointing at. */
  function addHover (btnEl) {
    if (btnEl.__xrqHover) { return; }
    var plane = btnEl.querySelector('a-plane');
    if (!plane) { return; }
    btnEl.__xrqHover = true;
    var orig = null;
    btnEl.addEventListener('mouseenter', function () {
      var m = plane.getAttribute('material') || {};
      if (orig === null) { orig = m.color || '#1e2a44'; }
      plane.setAttribute('material', 'color', '#3b6ea8');
    });
    btnEl.addEventListener('mouseleave', function () {
      if (orig !== null) { plane.setAttribute('material', 'color', orig); }
    });
  }
  function hoverAll () {
    Array.prototype.forEach.call(document.querySelectorAll('#vrmenu .clickable'), addHover);
  }
  document.addEventListener('DOMContentLoaded', function () {
    var sc = document.querySelector('a-scene');
    if (!sc) { return; }
    if (sc.hasLoaded) { hoverAll(); } else { sc.addEventListener('loaded', hoverAll); }
  });

  /* ---------- AR environment ---------------------------------------------- */
  AFRAME.registerComponent('quest-ar', {
    schema: { hide: { default: '' }, env: { default: true } },
    init: function () {
      var self = this, sc = this.el;
      this.hidden = []; this.fog = null; this.active = false;
      sc.addEventListener('enter-vr', function () { if (sc.is('ar-mode')) { self.on(); } });
      sc.addEventListener('exit-vr', function () { self.off(); });
    },
    on: function () {
      var sc = this.el, self = this;
      if (this.active) { return; }
      this.active = true;
      if (this.data.env) {
        sc.setAttribute('background', 'transparent', true);
        if (sc.hasAttribute('fog')) { this.fog = sc.getAttribute('fog'); sc.removeAttribute('fog'); }
      }
      this.hidden = [];
      if (this.data.hide) {
        Array.prototype.forEach.call(document.querySelectorAll(this.data.hide), function (el) {
          if (!el.object3D) { return; }
          self.hidden.push([el, el.object3D.visible]);
          el.object3D.visible = false;
        });
      }
    },
    off: function () {
      var sc = this.el;
      if (!this.active) { return; }
      this.active = false;
      this.hidden.forEach(function (p) { p[0].object3D.visible = p[1]; });
      this.hidden = [];
      if (this.data.env) {
        sc.setAttribute('background', 'transparent', false);
        if (this.fog) { sc.setAttribute('fog', this.fog); this.fog = null; }
      }
    }
  });

  /* Place a panel in front of where the user is LOOKING (side > 0 = to the right).
     Runs again after 500 ms: the head pose reaches the camera after the first XR frame. */
  XRQ.faceUser = function (el, dist, y, side) {
    side = side || 0;
    function put () {
      var sc = el.sceneEl, cam = sc && sc.camera;
      if (!cam) { return; }
      var pos = new THREE.Vector3(), fwd = new THREE.Vector3();
      cam.getWorldPosition(pos);
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) { fwd.set(0, 0, -1); }
      fwd.normalize();
      var right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      el.object3D.position.copy(pos).addScaledVector(fwd, dist).addScaledVector(right, side);
      el.object3D.position.y = y;
      el.object3D.lookAt(pos.x, y, pos.z);
    }
    put();
    setTimeout(put, 500);
  };

  /* ---------- build 18: model-fit - realistic glTF props, loaded once -------
     <a-entity model-fit="src: assets/x.glb; height: 2; width: 0.6; depth: 1;
                          yaw: 90; hide: Object_2">
     - every entity with the same src shares ONE download and ONE copy of the
       geometry/materials (scene.clone), so 16 racks cost what 1 rack costs
     - sized to `height` (uniform) or to an exact width x height x depth box
       (width/depth > 0 stretch those axes), base on y = 0, centred on x/z
     - `yaw` turns the model before fitting, `hide` lists node names to drop */
  var MODEL_CACHE = {};
  function loadShared (src) {
    if (!MODEL_CACHE[src]) {
      MODEL_CACHE[src] = new Promise(function (resolve, reject) {
        new THREE.GLTFLoader().load(src, resolve, undefined, reject);
      });
    }
    return MODEL_CACHE[src];
  }
  XRQ.loadModel = loadShared;
  AFRAME.registerComponent('model-fit', {
    schema: {
      src: { type: 'string' },
      height: { default: 0 }, width: { default: 0 }, depth: { default: 0 },
      yaw: { default: 0 },
      hide: { type: 'array', default: [] }
    },
    init: function () {
      var self = this, d = this.data;
      loadShared(d.src).then(function (gltf) {
        if (!self.el.parentNode) { return; }
        var inner = gltf.scene.clone(true);
        d.hide.forEach(function (name) {
          var n = name && inner.getObjectByName(name);
          if (n) { n.visible = false; n.parent.remove(n); }
        });
        inner.rotation.y = d.yaw * Math.PI / 180;
        var turn = new THREE.Group(); turn.add(inner); turn.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(turn), size = new THREE.Vector3(), c = new THREE.Vector3();
        box.getSize(size); box.getCenter(c);
        var k = d.height > 0 ? d.height / size.y : 1;
        var sx = d.width > 0 ? d.width / size.x : k, sz = d.depth > 0 ? d.depth / size.z : k;
        var fit = new THREE.Group();
        fit.add(turn);
        turn.position.set(-c.x, -box.min.y, -c.z);
        fit.scale.set(sx, k, sz);
        self.el.setObject3D('mesh', fit);
        self.size = new THREE.Vector3(size.x * sx, size.y * k, size.z * sz);
        self.el.emit('model-fit-loaded', { size: self.size });
      }).catch(function (e) {
        console.warn('model-fit: could not load ' + d.src + ' - keeping the simple shapes', e && e.message);
        self.el.emit('model-fit-error', { src: d.src });
      });
    },
    remove: function () { this.el.removeObject3D('mesh'); }
  });

  /* ---------- build 18: draw-call reduction (Quest 2: Meta suggests ~200-300) --
     XRQ.instanceModel(src, rootEl, targets, opts) -> Promise
       One glTF placed at many entities (e.g. 16 racks) becomes ONE InstancedMesh
       per model part. Matrices are stored relative to rootEl (#world), so the AR
       table-top model still moves and scales everything together.
     XRQ.mergeStatic(rootEl, groups) -> number of meshes merged
       Shapes that never change after load are merged per material. Each merged
       mesh lives on a new entity that copies the source's class (hall-wall,
       hall-ceiling...), so AR mode's `hide` selectors still find it. */
  function fitGroup (gltf, d, boxGltf) {
    var inner = gltf.scene.clone(true);
    (d.hide || []).forEach(function (name) {
      var n = name && inner.getObjectByName(name);
      if (n && n.parent) { n.parent.remove(n); }
    });
    inner.rotation.y = (d.yaw || 0) * Math.PI / 180;
    var turn = new THREE.Group(); turn.add(inner); turn.updateMatrixWorld(true);
    /* boxGltf: size this model by ANOTHER model's box (same source file family),
       e.g. a rack with its console fitted exactly like the plain rack */
    var ref = turn;
    if (boxGltf) {
      var ri = boxGltf.scene.clone(true); ri.rotation.y = inner.rotation.y;
      ref = new THREE.Group(); ref.add(ri); ref.updateMatrixWorld(true);
    }
    var box = new THREE.Box3().setFromObject(ref), size = new THREE.Vector3(), c = new THREE.Vector3();
    box.getSize(size); box.getCenter(c);
    var k = d.height > 0 ? d.height / size.y : 1;
    var fit = new THREE.Group(); fit.add(turn);
    turn.position.set(-c.x, -box.min.y, -c.z);
    fit.scale.set(d.width > 0 ? d.width / size.x : k, k, d.depth > 0 ? d.depth / size.z : k);
    fit.updateMatrixWorld(true);
    return { group: fit, size: new THREE.Vector3(size.x * fit.scale.x, size.y * k, size.z * fit.scale.z) };
  }
  XRQ.instanceModel = function (src, rootEl, targets, opts) {
    opts = opts || {};
    return Promise.all([loadShared(src), opts.fitSrc ? loadShared(opts.fitSrc) : null]).then(function (r) {
      var f = fitGroup(r[0], opts, r[1]), root = rootEl.object3D;
      root.updateMatrixWorld(true);
      var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      var rel = targets.map(function (t) {
        t.object3D.updateMatrixWorld(true);
        return new THREE.Matrix4().multiplyMatrices(inv, t.object3D.matrixWorld);
      });
      var holder = new THREE.Group(); holder.name = 'xrq-instances:' + src;
      var m = new THREE.Matrix4(), parts = 0;
      f.group.traverse(function (o) {
        if (!o.isMesh) { return; }
        var im = new THREE.InstancedMesh(o.geometry, o.material, rel.length);
        rel.forEach(function (r, i) { im.setMatrixAt(i, m.multiplyMatrices(r, o.matrixWorld)); });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingBox(); im.computeBoundingSphere();
        holder.add(im); parts++;
      });
      root.add(holder);
      return { size: f.size, parts: parts, holder: holder };
    });
  };

  var IMG_IDS = new WeakMap(), imgSeq = 0;
  function texKey (t) {
    if (!t) { return ''; }
    var img = t.image || (t.source && t.source.data);
    if (img && typeof img === 'object') {                 /* same picture = same texture, even if A-Frame made copies */
      if (!IMG_IDS.has(img)) { IMG_IDS.set(img, ++imgSeq); }
      return 'img' + IMG_IDS.get(img) + '@' + t.repeat.x + ',' + t.repeat.y + ',' + t.offset.x + ',' + t.offset.y + ',' + t.wrapS + t.wrapT;
    }
    return t.uuid;
  }
  function matKey (m) {
    var k = [m.type, m.color ? m.color.getHexString() : '', texKey(m.map),
             m.transparent ? 1 : 0, (+m.opacity).toFixed(3), m.side, m.depthWrite ? 1 : 0];
    if (m.emissive) { k.push(m.emissive.getHexString(), (+m.emissiveIntensity).toFixed(2)); }
    if (m.roughness !== undefined) { k.push(m.roughness, m.metalness); }
    return k.join('|');
  }
  XRQ.mergeStatic = function (rootEl, groups) {
    var root = rootEl.object3D, merged = 0;
    var BGU = THREE.BufferGeometryUtils;
    if (!BGU || !BGU.mergeGeometries) { return 0; }
    root.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    groups.forEach(function (g) {
      var src = typeof g.el === 'string' ? document.querySelector(g.el) : g.el;
      if (!src) { return; }
      var skip = g.skip ? Array.prototype.slice.call(src.querySelectorAll(g.skip)) : [];
      var buckets = {};
      src.object3D.traverse(function (o) {
        if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.material || Array.isArray(o.material)) { return; }
        var el = o.el;
        if (!el || el.tagName === 'A-TEXT' || (el.components && el.components.text)) { return; }
        if (o.material.visible === false) { return; }
        for (var p = o; p; p = p.parent) { if (!p.visible) { return; } }
        for (var e = el; e && e !== src.parentEl; e = e.parentEl) { if (skip.indexOf(e) !== -1) { return; } }
        var cls = (g.keepClass || []).filter(function (c) {
          for (var e2 = el; e2 && e2 !== src.parentEl; e2 = e2.parentEl) { if (e2.classList && e2.classList.contains(c)) { return true; } }
          return false;
        })[0] || '';
        var key = cls + '#' + matKey(o.material);
        (buckets[key] = buckets[key] || { cls: cls, mat: o.material, meshes: [] }).meshes.push(o);
      });
      Object.keys(buckets).forEach(function (key) {
        var b = buckets[key];
        if (b.meshes.length < 2) { return; }
        var geoms = b.meshes.map(function (o) {
          var gm = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
          ['position', 'normal', 'uv'].forEach(function (a) { if (!gm.attributes[a]) { gm.deleteAttribute && gm.deleteAttribute(a); } });
          Object.keys(gm.attributes).forEach(function (a) { if (['position', 'normal', 'uv'].indexOf(a) === -1) { gm.deleteAttribute(a); } });
          gm.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
          return gm;
        });
        var hasUV = geoms.every(function (gm) { return gm.attributes.uv; });
        var hasN = geoms.every(function (gm) { return gm.attributes.normal; });
        geoms.forEach(function (gm) { if (!hasUV) { gm.deleteAttribute('uv'); } if (!hasN) { gm.deleteAttribute('normal'); } });
        var one = BGU.mergeGeometries(geoms, false);
        if (!one) { return; }
        var holder = document.createElement('a-entity');
        holder.setAttribute('class', ('merged-static ' + b.cls + ' ' + (g.addClass || '')).trim());
        rootEl.appendChild(holder);
        holder.setObject3D('mesh', new THREE.Mesh(one, b.mat));
        b.meshes.forEach(function (o) { o.visible = false; });
        merged += b.meshes.length;
      });
    });
    return merged;
  };

  /* ---------- build 30: lazy-follow side panel (shared; was chapter 3 only) -----
     Hangs to the lower-left of where you look and drifts after you only when
     you turn or walk away. vrOnly: ignore it in AR (chapter 1/2 control walls). */
  AFRAME.registerComponent('lazy-follow', {
    schema: { dist: { default: 0.8 }, side: { default: -0.30 }, down: { default: 0.32 },
              maxMove: { default: 0.30 }, maxAngle: { default: 40 }, vrOnly: { default: false } },
    init: function () {
      this.h = new THREE.Vector3(); this.f = new THREE.Vector3(); this.t = new THREE.Vector3();
      this.d = new THREE.Vector3(); this.p = new THREE.Vector3(); this.moving = false; this.wasVisible = false;
    },
    target: function (cam) {
      cam.getWorldPosition(this.h); cam.getWorldDirection(this.f);
      this.f.y = 0; if (this.f.lengthSq() < 1e-6) { this.f.set(0, 0, -1); } this.f.normalize();
      var D = this.data;
      this.t.copy(this.h).addScaledVector(this.f, D.dist);
      this.t.x += -this.f.z * D.side; this.t.z += this.f.x * D.side;
      this.t.y = this.h.y - D.down;
      return this.t;
    },
    toLocal: function (v) { var par = this.el.object3D.parent; if (par) { par.updateMatrixWorld(true); par.worldToLocal(v); } return v; },
    snap: function (cam) {
      var o = this.el.object3D;
      o.position.copy(this.toLocal(this.p.copy(this.target(cam)))); this.face(); this.moving = false;
    },
    face: function () {
      var o = this.el.object3D; o.updateMatrixWorld(true);
      var par = o.parent, hl = this.p.copy(this.h); if (par) { par.worldToLocal(hl); }
      o.lookAt(this.h);
    },
    tick: function (t, dt) {
      var sc = this.el.sceneEl, cam = sc.camera, o = this.el.object3D;
      if (!cam) { return; }
      if (this.data.vrOnly && sc.is('ar-mode')) { this.wasVisible = false; return; }
      var vis = o.visible;
      if (vis && !this.wasVisible) { this.snap(cam); }
      this.wasVisible = vis;
      if (!vis) { return; }
      var tg = this.toLocal(this.p.copy(this.target(cam)));
      var wp = new THREE.Vector3(); o.getWorldPosition(wp);
      if (!this.moving) {
        this.d.subVectors(wp, this.h).setY(0);
        var ang = this.d.lengthSq() > 1e-6 ? THREE.MathUtils.radToDeg(this.d.angleTo(this.f)) : 0;
        if (o.position.distanceTo(tg) > this.data.maxMove || ang > this.data.maxAngle + 30) { this.moving = true; }
      }
      if (this.moving) {
        o.position.lerp(tg, Math.min(1, (dt || 16) / 1000 * 4));
        if (o.position.distanceTo(tg) < 0.02) { this.moving = false; }
      }
      o.lookAt(this.h);
    }
  });
  /* Y on the left controller hides/shows a panel while in XR. */
  XRQ.yToggle = function (el, onToggle) {
    var hand = document.getElementById('handL');
    if (!hand || !el) { return; }
    hand.addEventListener('ybuttondown', function () {
      var sc = el.sceneEl; if (!sc || !XRQ.inXR(sc)) { return; }
      var on = !el.object3D.visible; el.setAttribute('visible', on); el.object3D.visible = on;
      if (onToggle) { onToggle(on); }
    });
  };

  /* ---------- build 30: glowing portal exit door (chapters 2 and 3) --------------
     <a-entity portal-door="col: #22d3ee; title: MAIN HALL; sub: ...; flip: true">
     Same family as the lobby gates: chamfered metal frame, bright rim, pulsing
     glow band, scrolling energy, tunnel rings, label plate, orbiting motes,
     floor pad and a soft wet-floor streak. Built-in materials only. */
  var PD = {};
  function pdCanvas (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function pdTex (c, rep) { var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }
  function pdShared () {
    if (PD.glow) { return PD; }
    var c = pdCanvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); PD.glow = pdTex(c);
    c = pdCanvas(4, 128); g = c.getContext('2d'); gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); PD.vfade = pdTex(c);
    c = pdCanvas(512, 640); g = c.getContext('2d'); gr = g.createRadialGradient(256, 340, 30, 256, 320, 380);
    gr.addColorStop(0, 'rgba(255,255,255,.03)'); gr.addColorStop(0.62, 'rgba(255,255,255,.07)'); gr.addColorStop(0.86, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 640); PD.portal = pdTex(c);
    c = pdCanvas(256, 512); g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
    var seed = 3; function r () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 220; i++) { var x = r() * 256, y = r() * 512, hh = 20 + r() * 120, w = 1 + r() * 3, lg = g.createLinearGradient(0, y, 0, y + hh);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,' + (0.15 + r() * 0.5).toFixed(2) + ')'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(x, y, w, hh); }
    PD.noise = pdTex(c, true);
    return PD;
  }
  function pdShape (w, h, c) {
    var s = new THREE.Shape(), x = -w / 2;
    s.moveTo(x + c, 0); s.lineTo(x + w - c, 0); s.lineTo(x + w, c); s.lineTo(x + w, h - c);
    s.lineTo(x + w - c, h); s.lineTo(x + c, h); s.lineTo(x, h - c); s.lineTo(x, c); s.closePath(); return s;
  }
  function pdRing (wo, ho, co, wi, hi, ci, yi, depth) {
    var s = pdShape(wo, ho, co), hole = pdShape(wi, hi, ci);
    s.holes.push(new THREE.Path(hole.getPoints().map(function (p) { return new THREE.Vector2(p.x, p.y + yi); }).reverse()));
    return new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false, curveSegments: 1 });
  }
  function pdAdd (color, op, map) {
    return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, map: map || null, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  }
  AFRAME.registerComponent('portal-door', {
    schema: { col: { default: '#22d3ee' }, title: { default: 'MAIN HALL' }, sub: { default: '' }, flip: { default: false } },
    init: function () {
      var S = pdShared(), D = this.data, root = new THREE.Group(), self = this;
      root.rotation.y = D.flip ? Math.PI : 0; this.el.object3D.add(root); this.root = root;
      var col = new THREE.Color(D.col), hot = col.clone().lerp(new THREE.Color('#ffffff'), 0.35);
      var frameM = new THREE.MeshStandardMaterial({ color: '#1c2433', metalness: 0.75, roughness: 0.38 });
      var trimM = new THREE.MeshStandardMaterial({ color: '#2c3748', metalness: 0.8, roughness: 0.3 });
      function put (geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); root.add(m); return m; }
      put(pdRing(3.3, 3.55, 0.55, 2.3, 2.85, 0.38, 0.12, 0.45), frameM, 0, 0, -0.2);
      put(pdRing(3.55, 3.75, 0.62, 3.3, 3.55, 0.55, 0.1, 0.22), trimM, 0, 0, -0.3);
      [-1, 1].forEach(function (s) {
        put(new THREE.BoxGeometry(0.42, 3.3, 0.6), frameM, s * 1.95, 1.65, -0.1);
        put(new THREE.BoxGeometry(0.5, 0.26, 0.7), trimM, s * 1.95, 0.13, -0.1);
        put(new THREE.BoxGeometry(0.05, 2.4, 0.02), new THREE.MeshBasicMaterial({ color: hot, toneMapped: false }), s * 1.95, 1.65, 0.21);
      });
      put(pdRing(2.42, 2.97, 0.42, 2.3, 2.85, 0.38, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: hot, toneMapped: false }), 0, 0.06, 0.27);
      this.band = put(pdRing(2.78, 3.32, 0.5, 2.42, 2.97, 0.42, 0.18, 0.01), pdAdd(col, 0.75), 0, -0.12, 0.28);
      put(pdRing(3.62, 3.82, 0.64, 3.55, 3.75, 0.62, 0.035, 0.01), new THREE.MeshBasicMaterial({ color: hot, toneMapped: false }), 0, -0.035, -0.07);
      var pg = new THREE.ShapeGeometry(pdShape(2.3, 2.85, 0.38));
      put(pg, new THREE.MeshBasicMaterial({ color: '#02040a', toneMapped: false }), 0, 0.18, -0.02);
      this.base = put(pg, pdAdd(col, 1.0, S.portal), 0, 0.18, 0.05);
      this.ntex = S.noise.clone(); this.ntex.needsUpdate = true; this.ntex.repeat.set(1.4, 1);
      this.energy = put(pg, pdAdd(col, 0.28, this.ntex), 0, 0.18, 0.08);
      this.rings = [0.84, 0.68, 0.52, 0.36].map(function (k, i) {
        return put(pdRing(2.3 * k + 0.05, 2.85 * k + 0.05, 0.38 * k + 0.02, 2.3 * k, 2.85 * k, 0.38 * k, 0.025, 0.01), pdAdd(col, 0.4),
          0, 0.18 + 2.85 * (1 - k) / 2 - 0.025, -i * 0.012);
      });
      put(new THREE.PlaneGeometry(1.3, 1.7), pdAdd(col, 0.5, S.glow), 0, 1.55, -0.005);
      put(new THREE.PlaneGeometry(5.6, 5.6), pdAdd(col, 0.3, S.glow), 0, 1.6, 0.02);
      put(new THREE.PlaneGeometry(2.7, 3.2), pdAdd(col, 0.3, S.vfade), 0, 1.5, 0.35);
      var pad = put(new THREE.PlaneGeometry(3.0, 1.9).rotateX(-Math.PI / 2), pdAdd(col, 0.65, S.glow), 0, 0.025, 1.0); pad.renderOrder = 2;
      var st = put(new THREE.PlaneGeometry(2.6, 5.5).rotateX(-Math.PI / 2), pdAdd(col, 0.35, S.vfade), 0, 0.02, 2.9); st.rotation.y = Math.PI; st.renderOrder = 2;
      /* label plate */
      var lc = pdCanvas(1024, 300), g = lc.getContext('2d');
      g.fillStyle = 'rgba(4,8,16,.84)'; g.beginPath(); g.moveTo(40, 10); g.lineTo(984, 10); g.lineTo(1014, 40); g.lineTo(1014, 260); g.lineTo(984, 290);
      g.lineTo(40, 290); g.lineTo(10, 260); g.lineTo(10, 40); g.closePath(); g.fill(); g.lineWidth = 6; g.strokeStyle = D.col; g.stroke();
      g.textAlign = 'center'; g.save(); g.shadowColor = D.col; g.shadowBlur = 24; g.fillStyle = hot.getStyle(); g.font = '800 120px system-ui, sans-serif';
      g.fillText(D.title, 512, 150); g.restore();
      g.fillStyle = '#cbd5e1'; g.font = '600 46px system-ui, sans-serif'; g.fillText(D.sub, 512, 232);
      var lab = put(new THREE.PlaneGeometry(2.1, 0.62), new THREE.MeshBasicMaterial({ map: pdTex(lc), transparent: true, depthWrite: false, toneMapped: false }), 0, 2.45, 0.32);
      /* orbiting motes */
      var N = 130, pos = new Float32Array(N * 3), colA = new Float32Array(N * 3), c2 = new THREE.Color();
      this.motes = [];
      for (var i = 0; i < N; i++) {
        this.motes.push({ a: Math.random() * Math.PI * 2, sp: (0.12 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1),
          rx: 1.55 + Math.random() * 0.55, ry: 1.75 + Math.random() * 0.55, z: 0.35 + Math.random() * 0.9, w: Math.random() * 6.28 });
        c2.copy(col).lerp(new THREE.Color('#ffffff'), Math.random() * 0.4); colA[i * 3] = c2.r; colA[i * 3 + 1] = c2.g; colA[i * 3 + 2] = c2.b;
      }
      this.mgeo = new THREE.BufferGeometry(); this.mgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.mgeo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
      var pts = new THREE.Points(this.mgeo, new THREE.PointsMaterial({ size: 0.075, map: S.glow, vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      pts.frustumCulled = false; pts.renderOrder = 6; root.add(pts);
      /* click target */
      var hit = document.createElement('a-entity');
      hit.setAttribute('geometry', 'primitive: plane; width: 2.4; height: 3.0');
      hit.setAttribute('material', 'visible: false; side: double');
      hit.setAttribute('position', '0 1.6 ' + (D.flip ? -0.35 : 0.35));
      this.el.appendChild(hit);
    },
    tick: function (t, dt) {
      var now = performance.now(), k = Math.min(dt || 16, 100) / 1000;
      this.ntex.offset.y -= k * 0.35; this.ntex.offset.x = Math.sin(now / 2300) * 0.08;
      this.energy.material.opacity = 0.24 + 0.08 * Math.sin(now / 420);
      this.base.material.opacity = 0.88 + 0.12 * Math.sin(now / 700);
      this.band.material.opacity = 0.6 + 0.25 * Math.sin(now / 520);
      this.rings.forEach(function (r, i) { r.material.opacity = 0.12 + 0.4 * Math.pow(0.5 + 0.5 * Math.sin(now / 380 - i * 1.1), 2); });
      var a = this.mgeo.attributes.position.array;
      for (var i = 0; i < this.motes.length; i++) {
        var q = this.motes[i]; q.a += q.sp * k;
        var wob = Math.sin(now / 900 + q.w) * 0.12, y = 1.65 + Math.sin(q.a) * (q.ry + wob) + Math.sin(now / 1300 + q.w) * 0.1;
        a[i * 3] = Math.cos(q.a) * (q.rx + wob); a[i * 3 + 1] = Math.max(0.05, y); a[i * 3 + 2] = q.z + Math.sin(now / 1100 + q.w * 2) * 0.15;
      }
      this.mgeo.attributes.position.needsUpdate = true;
    }
  });

  /* ---------- build 31: sound effects ---------------------------------------
     All sounds are generated with Web Audio (no audio files, nothing to license,
     works offline). Footsteps are quiet; doors are louder. ?sound=0 mutes.
     Browsers only start audio after a user action, so the context is resumed
     on any click / key / touch / trigger press and when VR or AR starts. */
  var SFX = XRQ.sfx = (function () {
    var ctx = null, master = null, verb = null, noiseBuf = null, side = 1, lastWhoosh = 0;
    var muted = /[?&]sound=0/.test(location.search);
    function make () {
      if (ctx || muted) { return ctx; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return null; }
      try { ctx = new AC(); } catch (e) { ctx = null; return null; }
      master = ctx.createGain(); master.gain.value = 0.9;
      /* no compressor: Chromium's adds automatic make-up gain, which evened out the
         quiet footsteps and the louder doors. Levels are set per sound instead. */
      master.connect(ctx.destination);
      /* a short dark echo so the sounds sit in a room rather than in your ears */
      verb = ctx.createDelay(1.0); verb.delayTime.value = 0.13;
      var fb = ctx.createGain(); fb.gain.value = 0.32;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      var wet = ctx.createGain(); wet.gain.value = 0.35;
      verb.connect(lp); lp.connect(fb); fb.connect(verb); lp.connect(wet); wet.connect(master);
      var len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
      return ctx;
    }
    function wake () {
      if (!make()) { return false; }
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume().catch(function () {}); } catch (e) {} }
      return ctx.state === 'running';
    }
    function noise (t0, dur) {
      var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      s.start(t0, Math.random() * 1.2); s.stop(t0 + dur + 0.05);
      return s;
    }
    function env (g, t0, a, peak, hold, rel) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
      return g;
    }
    /* gains start silent: a GainNode defaults to 1 until its envelope begins, which let a
       full-volume click through wherever a source started a few ms before its envelope */
    function gain () { var g = ctx.createGain(); g.gain.value = 0; return g; }
    function filt (type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) { b.Q.value = q; } return b; }
    function osc (type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }

    /* quiet footstep: a soft heel thump plus a short scuff on the floor */
    function step (vol) {
      if (!wake()) { return; }                     /* never queue steps while audio is blocked */
      var t = ctx.currentTime + 0.005, v = (vol || 1) * 0.25 * (0.85 + Math.random() * 0.3);
      side = -side;
      var out = master;
      if (ctx.createStereoPanner) { out = ctx.createStereoPanner(); out.pan.value = side * 0.18; out.connect(master); }
      var o = osc('sine', 110 + Math.random() * 25);
      o.frequency.setValueAtTime(110 + Math.random() * 25, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
      var g = env(gain(), t, 0.006, v, 0.018, 0.12);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2);
      var n = noise(t, 0.12), f = filt('bandpass', 900 + Math.random() * 500, 0.9);
      var g2 = env(gain(), t + 0.01, 0.006, v * 0.55, 0.01, 0.07);
      n.connect(f); f.connect(g2); g2.connect(out);
    }

    /* louder futuristic teleport: rising filtered noise + a vibrato synth chirp + sparkle */
    function whoosh () {
      wake(); if (!ctx) { return; }
      var t = ctx.currentTime + 0.01, V = 1.4;
      lastWhoosh = Date.now();
      var n = noise(t, 1.0), bp = filt('bandpass', 260, 2.2);
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.exponentialRampToValueAtTime(3800, t + 0.55);
      bp.frequency.exponentialRampToValueAtTime(1200, t + 0.95);
      var g = env(gain(), t, 0.18, V * 0.9, 0.2, 0.55);
      n.connect(bp); bp.connect(g); g.connect(master); g.connect(verb);
      var o = osc('sawtooth', 140);
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.6);
      var lp = filt('lowpass', 600);
      lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(4200, t + 0.6);
      var lfo = osc('sine', 14), lg = gain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      var g2 = env(gain(), t, 0.25, V * 0.28, 0.15, 0.4);
      o.connect(lp); lp.connect(g2); g2.connect(master); g2.connect(verb);
      o.start(t); o.stop(t + 0.9); lfo.start(t); lfo.stop(t + 0.9);
      [1760, 2637].forEach(function (fr, i) {
        var s = osc('sine', fr), sg = env(gain(), t + 0.42 + i * 0.05, 0.02, V * 0.12, 0.05, 0.5);
        s.connect(sg); sg.connect(master); sg.connect(verb); s.start(t + 0.4); s.stop(t + 1.2);
      });
    }

    /* chapter 1 exit: pneumatic sliding door - hiss, rail rumble, end clunk */
    function slide (opening) {
      wake(); if (!ctx) { return; }
      var t = ctx.currentTime + 0.01, V = 0.7, dur = 0.85;
      var n = noise(t, dur + 0.2), bp = filt('bandpass', opening ? 3200 : 2400, 1.4);
      bp.frequency.setValueAtTime(opening ? 3200 : 2400, t);
      bp.frequency.linearRampToValueAtTime(opening ? 1900 : 1500, t + dur);
      var g = env(gain(), t, 0.03, V * 0.7, dur * 0.45, dur * 0.5);
      n.connect(bp); bp.connect(g); g.connect(master); g.connect(verb);
      var o = osc('sawtooth', 48);
      o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(opening ? 62 : 44, t + dur);
      var lp = filt('lowpass', 220), g2 = env(gain(), t, 0.08, V * 0.5, dur * 0.5, dur * 0.35);
      o.connect(lp); lp.connect(g2); g2.connect(master); o.start(t); o.stop(t + dur + 0.1);
      var tc = t + dur * 0.92, k = osc('sine', 90);
      k.frequency.setValueAtTime(90, tc); k.frequency.exponentialRampToValueAtTime(45, tc + 0.12);
      var g3 = env(gain(), tc, 0.004, V * 0.8, 0, 0.16);
      k.connect(g3); g3.connect(master); g3.connect(verb); k.start(tc); k.stop(tc + 0.2);
      var c = noise(tc, 0.05), cf = filt('lowpass', 1500), g4 = env(gain(), tc, 0.002, V * 0.4, 0, 0.04);
      c.connect(cf); cf.connect(g4); g4.connect(master);
    }

    /* softer portal "charge-up" when you walk up to a gate (lobby gates, ch2/ch3 exits) */
    function approach () {
      if (!wake()) { return; }
      var t = ctx.currentTime + 0.01, V = 0.3;
      var o = osc('triangle', 220), o2 = osc('sine', 331);
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(440, t + 0.7);
      o2.frequency.setValueAtTime(331, t); o2.frequency.exponentialRampToValueAtTime(662, t + 0.7);
      var lfo = osc('sine', 7), lg = gain(); lg.gain.value = 0.35; lfo.connect(lg);
      var trem = gain(); trem.gain.value = 0.65; lg.connect(trem.gain);
      var g = env(gain(), t, 0.3, V * 0.5, 0.25, 0.5);
      o.connect(trem); o2.connect(trem); trem.connect(g); g.connect(master); g.connect(verb);
      [o, o2, lfo].forEach(function (x) { x.start(t); x.stop(t + 1.2); });
      var n = noise(t, 1.0), hp = filt('highpass', 5000), gn = env(gain(), t, 0.4, V * 0.18, 0.1, 0.45);
      n.connect(hp); hp.connect(gn); gn.connect(master);
    }

    /* how long a page should wait before navigating, so the whoosh is heard */
    function navDelay () {
      return (ctx && ctx.state === 'running' && Date.now() - lastWhoosh < 400) ? 650 : 170;
    }

    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
      window.addEventListener(ev, wake, true);
    });
    document.addEventListener('DOMContentLoaded', function () {
      var sc = document.querySelector('a-scene');
      if (!sc) { return; }
      wake();                                     /* allowed straight away if the browser permits it */
      sc.addEventListener('enter-vr', function () {
        wake();
        var s = sc.xrSession;
        if (s && s.addEventListener) { s.addEventListener('selectstart', wake); }
      });
      sc.addEventListener('triggerdown', wake);
      var addSteps = function () {
        var rig = document.getElementById('rig');
        if (rig && !rig.hasAttribute('xrq-footsteps')) { rig.setAttribute('xrq-footsteps', ''); }
        /* every gate / portal gets an approach chime (ch1's sliding door has its own sound) */
        Array.prototype.forEach.call(document.querySelectorAll('[door-zone]'), function (d) {
          if (!d.hasAttribute('secure-door') && !d.hasAttribute('xrq-door-sfx')) { d.setAttribute('xrq-door-sfx', ''); }
        });
      };
      if (sc.hasLoaded) { addSteps(); } else { sc.addEventListener('loaded', addSteps); }
    });
    return { step: step, whoosh: whoosh, slide: slide, approach: approach, wake: wake, navDelay: navDelay,
             state: function () { return ctx ? ctx.state : (muted ? 'muted' : 'none'); } };
  })();

  /* approach chime: plays once when you come within `near` metres of a gate;
     re-arms after you step back beyond `far` */
  AFRAME.registerComponent('xrq-door-sfx', {
    schema: { near: { default: 3.2 }, far: { default: 4.2 } },
    init: function () { this.inside = null; this.w = new THREE.Vector3(); XRQ.doorChimes = XRQ.doorChimes || 0; },
    tick: function () {
      var rig = this.el.sceneEl.querySelector('#rig'); if (!rig) { return; }
      var sc = this.el.sceneEl;
      if (sc.is('ar-mode') || !this.el.object3D.visible || window.__dooring) { return; }
      this.el.object3D.getWorldPosition(this.w);
      var p = rig.object3D.position, d = Math.hypot(p.x - this.w.x, p.z - this.w.z);
      if (this.inside === null) { this.inside = d < this.data.far; return; }   /* no chime for where you spawn */
      if (!this.inside && d < this.data.near) { this.inside = true; XRQ.doorChimes++; SFX.approach(); }
      else if (this.inside && d > this.data.far) { this.inside = false; }
    }
  });

  /* footsteps whenever the player is moved (stick, WASD, touch joystick) -
     not for real walking in AR, snap turns or teleport jumps */
  AFRAME.registerComponent('xrq-footsteps', {
    schema: { stride: { default: 0.8 } },
    init: function () { this.last = new THREE.Vector3(); this.have = false; this.acc = 0; this.ry = 0; this.tLast = 0; XRQ.steps = 0; },
    tick: function (t, dt) {
      var o = this.el.object3D, p = o.position, sc = this.el.sceneEl;
      if (!this.have || o.rotation.y !== this.ry || sc.is('ar-mode') || XRQ.arModel || window.__dooring) {
        this.last.copy(p); this.ry = o.rotation.y; this.have = true; return;
      }
      var d = Math.hypot(p.x - this.last.x, p.z - this.last.z);
      this.last.copy(p);
      var sp = d / Math.max(0.001, (dt || 16) / 1000);
      if (d > 1 || sp < 0.3) { this.acc = Math.min(this.acc, this.data.stride * 0.6); return; }
      this.acc += d;
      if (this.acc >= this.data.stride && t - this.tLast > 260) {
        this.acc = 0; this.tLast = t; XRQ.steps++;
        SFX.step(Math.min(1.2, 0.75 + sp / 8));
      }
    }
  });
  /* ---------- build 39: the installed Quest app starts in VR ------------------
     Meta's packaged web apps (Bubblewrap, horizonOSAppMode "immersive") must open
     straight into WebXR. Meta's own test for "running inside the app" is
     window.getDigitalGoodsService (only defined in the packaged app, never in the
     Quest Browser tab). Inside the app, every page enters VR on its own; in the
     browser nothing changes. A-Frame's own 'sessiongranted' hand-over (gates between
     chapters) runs first; this only steps in when no session arrived. If the headset
     refuses (no user action yet), a large "Enter VR" button does it with one click.
     ?app=1 forces app mode, ?app=0 disables it (testing). */
  XRQ.inApp = (function () {
    var q = location.search;
    if (/[?&]app=0/.test(q)) { return false; }
    if (/[?&]app=1/.test(q)) { return true; }
    return IS_QUEST && typeof window.getDigitalGoodsService !== 'undefined';
  })();
  XRQ.appVR = { tries: 0, prompt: false, last: '' };
  function appPrompt (sc) {
    if (document.getElementById('xrq-appvr')) { return; }
    XRQ.appVR.prompt = true;
    var box = document.createElement('div');
    box.id = 'xrq-appvr';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:310;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(11,16,32,.80);font-family:system-ui,sans-serif');
    box.innerHTML = '<button id="xrq-appvr-go" style="font:800 28px system-ui;padding:28px 46px;' +
      'border-radius:18px;border:none;background:#22d3ee;color:#0b1020;cursor:pointer">Enter VR</button>';
    document.body.appendChild(box);
    document.getElementById('xrq-appvr-go').addEventListener('click', function () {
      box.remove(); XRQ.appVR.prompt = false; appEnter(sc, true);
    });
  }
  function appEnter (sc, fromClick) {
    if (XRQ.inXR(sc)) { return; }
    XRQ.appVR.tries++;
    var p;
    try { p = sc.enterVR(); } catch (e) { XRQ.appVR.last = 'error: ' + (e && e.message); appPrompt(sc); return; }
    if (!p || !p.then) { setTimeout(function () { if (!XRQ.inXR(sc)) { appPrompt(sc); } }, 1500); return; }
    if (p && p.then) {
      p.then(function () {
        setTimeout(function () {
          XRQ.appVR.last = XRQ.inXR(sc) ? 'in VR' : 'not entered';
          if (!XRQ.inXR(sc) && !fromClick) { appPrompt(sc); }
        }, 1500);
      }, function (e) {
        XRQ.appVR.last = 'refused: ' + (e && e.message);
        /* a hand-over may have won the race: only ask when still outside VR */
        setTimeout(function () { if (!XRQ.inXR(sc)) { appPrompt(sc); } }, 1500);
      });
    }
  }
  if (XRQ.inApp) {
    document.documentElement.classList.add('in-app');
    document.addEventListener('DOMContentLoaded', function () {
      var sc = document.querySelector('a-scene'); if (!sc) { return; }
      var started = false;
      var start = function () {
        if (started) { return; } started = true;
        /* give a granted session (arrival through a gate) a moment to arrive first */
        setTimeout(function () { if (!XRQ.inXR(sc)) { appEnter(sc, false); } }, 1200);
      };
      if (sc.renderStarted) { start(); } else { sc.addEventListener('renderstart', start); }
      if (sc.hasLoaded) { start(); } else { sc.addEventListener('loaded', start); }
    });
  }

  /* ---------- build 37: voice guide -------------------------------------------
     XRQ.say(text) reads a guide text aloud with the browser's built-in speech
     (speechSynthesis: no audio files, no account, works offline on most devices).
     A new text always replaces the one being read. XRQ.hush() stops it.
     Off with ?voice=0 or ?sound=0, or the "Voice" button in a help tab
     (remembered in this browser). Silent, never an error, where speech is missing. */
  XRQ.voice = (function () {
    var synth = window.speechSynthesis, UtterC = window.SpeechSynthesisUtterance;
    var forced = /[?&](voice|sound)=0/.test(location.search);
    var on = true, pick = null, gen = 0, last = '';
    try { if (localStorage.getItem('itc-voice') === 'off') { on = false; } } catch (e) { /* storage blocked */ }
    function ok () { return !!(synth && UtterC) && !forced && on; }
    function choose () {
      if (!synth) { return null; }
      var vs = []; try { vs = synth.getVoices() || []; } catch (e) { vs = []; }
      var en = vs.filter(function (v) { return /^en([-_]|$)/i.test(v.lang || ''); });
      if (!en.length) { return null; }
      function score (v) {
        var n = (v.name || '') + ' ' + (v.lang || ''), s = 0;
        if (/natural|neural|online/i.test(n)) { s += 4; }
        if (/google/i.test(n)) { s += 3; }
        if (/en[-_](GB|IN|US)/i.test(v.lang || '')) { s += 2; }
        if (v.localService) { s += 1; }
        if (/novelty|whisper|bad news|bells|zarvox|bubbles|cellos|trinoids|albert|jester|organ|boing|hysterical|superstar|wobble|deranged|good news/i.test(n)) { s -= 20; }
        return s;
      }
      en.sort(function (a, b) { return score(b) - score(a); });
      return en[0];
    }
    if (synth && 'onvoiceschanged' in synth) {
      try { synth.addEventListener('voiceschanged', function () { pick = choose(); }); } catch (e) { /* old engines */ }
    }
    /* how the short texts should sound (abbreviations, units) */
    var SAY = [
      [/\bN\+1\b/g, 'N plus 1'], [/\b2N\b/g, '2 N'], [/\bA\s*\+\s*B\b/g, 'A and B'],
      [/(\d)\s*C\b/g, '$1 degrees'], [/(\d)\s*kV\b/g, '$1 kilovolts'], [/(\d)\s*ms\b/g, '$1 milliseconds'],
      [/(\d)\s*s\b/g, '$1 seconds'], [/(\d)U\b/g, '$1 U'], [/24\/7/g, 'around the clock'],
      [/\bCRACs\b/g, 'cracks'], [/\bCRAC(-?\d)?\b/g, function (m, d) { return 'crack' + (d ? ' ' + d.replace('-', '') : ''); }],
      [/\bTTL\b/g, 'T T L'], [/\bWASD\b/g, 'W A S D'], [/\bCDN\b/g, 'C D N'],
      [/\b(HIT|MISS|EDGE|ORIGIN|PRIMARY|WRITE|READ)\b/g, function (m) { return m.toLowerCase(); }],
      [/%/g, ' percent'], [/\s+-\s+/g, ', '], [/\s{2,}/g, ' ']
    ];
    function speakable (t) {
      var s = String(t || '');
      SAY.forEach(function (r) { s = s.replace(r[0], r[1]); });
      return s.trim();
    }
    function hush () { gen++; last = ''; if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } } }
    function say (text) {
      if (!ok() || !text) { return false; }
      var t = speakable(text); if (!t) { return false; }
      var my = ++gen; last = t;
      try { synth.cancel(); } catch (e) { /* ignore */ }
      /* Chrome can drop a speak() issued in the same task as cancel(): wait a beat */
      setTimeout(function () {
        if (my !== gen || !ok()) { return; }
        try {
          var u = new UtterC(t);
          if (!pick) { pick = choose(); }
          if (pick) { u.voice = pick; u.lang = pick.lang; } else { u.lang = 'en-US'; }
          u.rate = 1; u.pitch = 1; u.volume = 1;
          XRQ.voiceSpoken = (XRQ.voiceSpoken || 0) + 1; XRQ.voiceLast = t;
          if (synth.paused) { synth.resume(); }
          synth.speak(u);
        } catch (e) { /* speech unavailable: the text is still on screen */ }
      }, 80);
      return true;
    }
    function label (el) {
      var l = el.querySelector('[data-voice-label]') || el;
      l.textContent = (l === el ? 'Voice guide: ' : 'Voice guide · ') + (ok() ? 'on' : 'off');
      el.setAttribute('aria-pressed', ok() ? 'true' : 'false');
      if (!synth || forced) { el.disabled = true; el.title = synth ? 'muted by ?voice=0 / ?sound=0' : 'this browser has no speech'; }
    }
    function set (v) {
      on = !!v;
      try { localStorage.setItem('itc-voice', on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
      if (!on) { hush(); }
      Array.prototype.forEach.call(document.querySelectorAll('[data-voice-toggle]'), label);
      if (on) { say('Voice guide on.'); }
    }
    function wire () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-voice-toggle]'), function (el) {
        label(el);
        if (el.__voiceWired) { return; } el.__voiceWired = true;
        el.addEventListener('click', function () { set(!on); });
      });
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', wire); } else { wire(); }
    window.addEventListener('pagehide', hush);
    return { say: say, hush: hush, set: set, isOn: ok, speakable: speakable,
             state: function () { return !synth ? 'none' : forced ? 'muted' : on ? 'on' : 'off'; } };
  })();
  XRQ.say = XRQ.voice.say;
  XRQ.hush = XRQ.voice.hush;
})();
