/* xr-quest.js - shared Meta Quest helpers for "Inside the Cloud" (build 12).
   Load with <script src="xr-quest.js"></script> right after vendor/aframe.min.js,
   before <a-scene>, so the components register before the scene is parsed.

   1. thumbstick-locomotion  left stick walks, right stick snap-turns 30 deg.
      Works in VR AND passthrough AR. Reads the raw WebXR gamepads first, so it
      works with any controller model; falls back to A-Frame's thumbstickmoved.
      (The old per-page version called scene.camera.object3D, which does not
      exist - scene.camera is the raw three.js camera - so it threw a TypeError
      on the first stick push. That was the "can't move in VR" bug.)
   2. quest-ar               on the scene: in AR, clears the background and fog
      and hides the room shell so the real room shows through.
   3. XRQ.faceUser(el,d,y)   puts an in-VR menu d metres in front of the head.
   4. On the Quest Browser's flat 2D view the on-screen stick is shown, since
      there is no keyboard. */
(function () {
  if (typeof AFRAME === 'undefined') { return; }
  var UA = navigator.userAgent || '';
  var IS_QUEST = /OculusBrowser|Quest/i.test(UA);
  var XRQ = window.XRQ = { isQuest: IS_QUEST, source: 'none',
                           stick: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } } };
  if (IS_QUEST) { document.documentElement.classList.add('coarse', 'quest'); }

  function sessionOf (sc) {
    if (sc.xrSession) { return sc.xrSession; }
    var xr = sc.renderer && sc.renderer.xr;
    return xr && xr.getSession ? xr.getSession() : null;
  }
  XRQ.inXR = function (sc) { return sc.is('vr-mode') || sc.is('ar-mode'); };
  /* Headset AR (world-space) vs phone AR (screen-space). */
  XRQ.headsetAR = function (sc) {
    var s = sessionOf(sc);
    if (s && s.interactionMode) { return s.interactionMode === 'world-space'; }
    return IS_QUEST;
  };

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
        /* Some runtimes put the stick on axes 0,1 even with 4 axes. */
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
      var rx = st.right.x;
      if (Math.abs(rx) > 0.7) {
        if (this.armed) { this.armed = false; this.snap(rx > 0 ? -1 : 1, cam); }
      } else if (Math.abs(rx) < 0.3) { this.armed = true; }
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
    /* Reuse each page's own walking limits (rig-walk bound / rbound).
       Chapter 1 has rig-bounds, which clamps every frame by itself. */
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

  /* Place an in-headset panel in front of where the user is LOOKING. Runs
     again after 500 ms because the head pose only reaches the camera once
     the first XR frame has rendered. */
  XRQ.faceUser = function (el, dist, y) {
    function put () {
      var sc = el.sceneEl, cam = sc && sc.camera;
      if (!cam) { return; }
      var pos = new THREE.Vector3(), fwd = new THREE.Vector3();
      cam.getWorldPosition(pos);
      cam.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) { fwd.set(0, 0, -1); }
      fwd.normalize();
      el.object3D.position.copy(pos).addScaledVector(fwd, dist);
      el.object3D.position.y = y;
      el.object3D.lookAt(pos.x, y, pos.z);
    }
    put();
    setTimeout(put, 500);
  };
})();
