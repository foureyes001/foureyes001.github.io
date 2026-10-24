/* xr-quest.js - shared Meta Quest / phone XR helpers for "Inside the Cloud" (build 24).
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
  var BUILD = 'build 24';
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
                   ['BRING HERE', function () { self.place(); }]];
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
        var box = new THREE.Box3().setFromObject(o);
        box.getCenter(this.centre); this.minY = box.min.y;
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
      var showPanel = !(d.mode === 'custom' && !XRQ.headsetAR(sc));
      var go = function () {
        if (!self.active) { return; }
        if (d.mode === 'model') { self.place(); }
        if (self.panel && showPanel) {
          self.panel.object3D.visible = true;
          if (d.mode === 'lobby') { XRQ.faceUser(self.panel, 1.5, 1.3, 0); }
          else { XRQ.faceUser(self.panel, 1.0, 1.0, 0.85); }
        }
        var vm2 = document.getElementById('vrmenu');
        if (vm2 && d.mode !== 'lobby') { vm2.object3D.visible = true; XRQ.faceUser(vm2, 2.3, 1.7, -0.15); }
      };
      go();
      setTimeout(go, 600);    /* head pose reaches the camera after the first XR frame */
    },
    stop: function () {
      var sc = this.el, d = this.data;
      if (!this.active) { return; }
      this.active = false;
      XRQ.arModel = false;
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
    place: function () {
      var d = this.data, cam = this.el.camera;
      if (d.mode === 'custom') { var H = window.XRQ_HOOKS; if (H && H.here) { H.here(); } return; }
      if (d.mode !== 'model' || !this.root || !cam) { return; }
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
})();
