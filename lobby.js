/* ==========================================================================
   build 28/29: the lobby as a sci-fi corridor (concept: neon-ribbed ceiling,
   circuit floor, three glowing chapter gates, liquid-cooling tank).
   Built from canvases + generated geometry, batched by material so the whole
   hall is a few dozen draw calls (Quest 2 budget). Only built-in materials
   (multiview-safe).
   ========================================================================== */
(function () {
  'use strict';
  var V3 = THREE.Vector3, TAU = Math.PI * 2;
  var W = 6.5, ZB = -8.5, ZF = 8.5, HW = 3.6, HC = 5.0, XC = 3.2;   /* half width, back/front z, wall top, ceiling, flat half-width */
  var GATES = [
    { n: 1, x: -4.2, col: '#fbbf24', glow: '#f59e0b', href: 'datacentre.html', title: 'INSIDE A DATA CENTRE',
      teaser: 'racks, power and cooling - where the cloud lives' },
    { n: 2, x: 0, col: '#22d3ee', glow: '#06b6d4', href: 'loadbalancer.html', title: 'LOAD BALANCING & AUTO-SCALING',
      teaser: 'one front door spreads work across many servers' },
    { n: 3, x: 4.2, col: '#2dd4bf', glow: '#14b8a6', href: 'cdn.html', title: 'CDN & EDGE CACHING',
      teaser: 'copies near users make the web feel instant' }
  ];
  var GZ = -8.15;                        /* gate plane */
  var FX = { portals: [], screens: [], status: [], bubbles: null, flows: [], leds: [], tank: null, t: 0 };

  /* ---------- helpers ---------- */
  function cv (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex (c, rep) {
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  function basic (o) { o = o || {}; o.toneMapped = false; return new THREE.MeshBasicMaterial(o); }
  function addMat (color, op, map) {
    return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op == null ? 1 : op, map: map || null,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  }
  function std (color, metal, rough, extra) {
    var o = { color: color, metalness: metal == null ? 0.5 : metal, roughness: rough == null ? 0.5 : rough };
    if (extra) { for (var k in extra) { o[k] = extra[k]; } }
    return new THREE.MeshStandardMaterial(o);
  }
  function rr (g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  var GLOW = (function () {
    var c = cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c);
  })();
  var STRIPGLOW = (function () {          /* soft band across v: bright centre line, fading out */
    var c = cv(4, 128), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,.35)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.58, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return tex(c);
  })();
  var VFADE = (function () {              /* bright at the bottom, fading up */
    var c = cv(4, 128), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return tex(c);
  })();

  /* Batch: collect geometry per material, merge once -> one draw call per material */
  function Batch () { this.b = {}; }
  Batch.prototype.add = function (key, mat, geo, m4) {
    var e = this.b[key] || (this.b[key] = { mat: mat, geos: [] });
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    ['uv1', 'uv2', 'normal'].forEach(function (a) { if (a !== 'normal' && g.attributes[a]) { g.deleteAttribute(a); } });
    if (!g.attributes.uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    if (!g.attributes.normal) { g.computeVertexNormals(); }
    if (m4) { g.applyMatrix4(m4); }
    e.geos.push(g);
  };
  Batch.prototype.flush = function (parent) {
    var out = {}, self = this;
    Object.keys(this.b).forEach(function (k) {
      var e = self.b[k], merged = THREE.BufferGeometryUtils.mergeGeometries(e.geos, false);
      e.geos.forEach(function (g) { g.dispose(); });
      var m = new THREE.Mesh(merged, e.mat); m.name = 'batch:' + k; parent.add(m); out[k] = m;
    });
    this.b = {};
    return out;
  };
  var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S1 = new V3(1, 1, 1);
  function mat4 (x, y, z, rx, ry, rz, sx, sy, sz) {
    E.set(rx || 0, ry || 0, rz || 0); Q.setFromEuler(E);
    return new THREE.Matrix4().compose(new V3(x, y, z), Q, new V3(sx || 1, sy || 1, sz || 1));
  }

  /* ---------- canvas textures ---------- */
  /* engraved line: dark cut + light lip below/right of it, so it reads as a groove (depth) */
  function groove (g, pts, w) {
    g.lineJoin = 'miter';
    g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (var k = 2; k < pts.length; k += 2) { g.lineTo(pts[k], pts[k + 1]); } g.stroke();
    g.strokeStyle = 'rgba(150,185,230,.16)'; g.lineWidth = Math.max(1, w * 0.45); g.beginPath(); g.moveTo(pts[0] + w * 0.7, pts[1] + w * 0.7);
    for (k = 2; k < pts.length; k += 2) { g.lineTo(pts[k] + w * 0.7, pts[k + 1] + w * 0.7); } g.stroke();
  }
  function chamRect (x, y, w, h, c) { return [x + c, y, x + w - c, y, x + w, y + c, x + w, y + h - c, x + w - c, y + h, x + c, y + h, x, y + h - c, x, y + c, x + c, y]; }
  function floorTex () {
    /* 1024 px = 4 m: four 2 m tiles, each with an engraved geometric (circuit-like) pattern and lit inlays */
    var c = cv(1024, 1024), g = c.getContext('2d'), T = 512;
    g.fillStyle = '#020409'; g.fillRect(0, 0, 1024, 1024);
    for (var ti = 0; ti < 2; ti++) { for (var tj = 0; tj < 2; tj++) {
      var ox = ti * T, oy = tj * T;
      g.save(); g.translate(ox + T / 2, oy + T / 2); g.rotate(((ti + tj) % 2) * Math.PI / 2); g.translate(-T / 2, -T / 2);
      var gr = g.createLinearGradient(0, 0, T, T);                            /* tile body, lit from the top-left */
      gr.addColorStop(0, '#152034'); gr.addColorStop(0.5, '#0e1524'); gr.addColorStop(1, '#080d16');
      g.fillStyle = gr; g.fillRect(8, 8, T - 16, T - 16);
      g.strokeStyle = 'rgba(170,200,240,.20)'; g.lineWidth = 3;               /* bevel: light top/left edge, dark bottom/right */
      g.beginPath(); g.moveTo(9, T - 9); g.lineTo(9, 9); g.lineTo(T - 9, 9); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(T - 9, 9); g.lineTo(T - 9, T - 9); g.lineTo(9, T - 9); g.stroke();
      /* concentric chamfered frames */
      groove(g, chamRect(40, 40, T - 80, T - 80, 40), 5);
      groove(g, chamRect(96, 96, T - 192, T - 192, 30), 4);
      groove(g, chamRect(170, 170, T - 340, T - 340, 18), 3);
      /* corner diagonals linking the frames, and traces from the centre to the middle frame */
      [[40, 80, 96, 126], [T - 40, 80, T - 96, 126], [40, T - 80, 96, T - 126], [T - 40, T - 80, T - 96, T - 126]].forEach(function (d) { groove(g, d, 3); });
      groove(g, [T / 2, 170, T / 2, 96], 3); groove(g, [T / 2, T - 170, T / 2, T - 96], 3);
      groove(g, [170, T / 2, 130, T / 2, 130, 150, 96, 150], 3); groove(g, [T - 170, T / 2, T - 130, T / 2, T - 130, T - 150, T - 96, T - 150], 3);
      /* pads (via holes) */
      [[T / 2, 96], [T / 2, T - 96], [96, 150], [T - 96, T - 150]].forEach(function (q) {
        g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.arc(q[0], q[1], 7, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(150,185,230,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(q[0] + 1, q[1] + 1, 7, 0, TAU); g.stroke();
      });
      /* lit inlays: short runs of light set into the grooves */
      g.save(); g.shadowColor = '#22d3ee'; g.shadowBlur = 10; g.strokeStyle = 'rgba(103,232,249,.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(140, 40); g.lineTo(T - 140, 40); g.stroke();
      g.beginPath(); g.moveTo(T - 40, T - 150); g.lineTo(T - 40, T - 220); g.stroke();
      g.beginPath(); g.moveTo(170, T / 2 - 40); g.lineTo(170, T / 2 + 40); g.stroke();
      g.beginPath(); g.moveTo(T / 2 - 30, T - 96); g.lineTo(T / 2 + 60, T - 96); g.stroke();
      g.restore();
      if ((ti + tj) % 2) { g.save(); g.shadowColor = '#fb923c'; g.shadowBlur = 8; g.strokeStyle = 'rgba(253,186,116,.7)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(96 + 30, T - 96); g.lineTo(T / 2 - 20, T - 96); g.stroke(); g.restore(); }
      g.restore();
    } }
    var t = tex(c, true); t.repeat.set(13 / 4, 17 / 4); return t;
  }
  function wallTex () {
    /* classic raised-frame / recessed-panel wall, lit from above: depth from light and shadow only */
    var c = cv(1024, 512), g = c.getContext('2d'), i;
    g.fillStyle = '#0b111b'; g.fillRect(0, 0, 1024, 512);
    for (i = 0; i < 4; i++) {
      var x = i * 256;
      var fr = g.createLinearGradient(0, 0, 0, 340); fr.addColorStop(0, '#182235'); fr.addColorStop(1, '#0e1522');
      g.fillStyle = fr; g.fillRect(x + 6, 14, 244, 316);                      /* raised frame */
      g.fillStyle = 'rgba(190,215,250,.18)'; g.fillRect(x + 6, 14, 244, 3); g.fillRect(x + 6, 14, 3, 316);
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x + 6, 327, 244, 4); g.fillRect(x + 247, 14, 4, 316);
      var inr = g.createLinearGradient(0, 40, 0, 300); inr.addColorStop(0, '#070b13'); inr.addColorStop(1, '#0c1320');
      g.fillStyle = inr; g.fillRect(x + 34, 42, 188, 262);                      /* recessed panel */
      g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(x + 34, 42, 188, 6); g.fillRect(x + 34, 42, 6, 262);   /* inner shadow top/left */
      g.fillStyle = 'rgba(180,205,245,.14)'; g.fillRect(x + 34, 300, 188, 3); g.fillRect(x + 219, 42, 3, 262);
      groove(g, chamRect(x + 62, 76, 132, 194, 16), 3);                         /* engraved inset line */
      [[x + 20, 28], [x + 236, 28], [x + 20, 316], [x + 236, 316]].forEach(function (r) {   /* rivets */
        g.fillStyle = '#05080e'; g.beginPath(); g.arc(r[0], r[1], 5, 0, TAU); g.fill();
        g.fillStyle = 'rgba(200,220,250,.35)'; g.beginPath(); g.arc(r[0] - 1.5, r[1] - 1.5, 2, 0, TAU); g.fill();
      });
      g.fillStyle = i % 2 ? 'rgba(251,146,60,.9)' : 'rgba(34,211,238,.9)'; g.fillRect(x + 196, 56, 12, 4); g.fillRect(x + 196, 66, 12, 4);
    }
    var rail = g.createLinearGradient(0, 336, 0, 360); rail.addColorStop(0, '#26324a'); rail.addColorStop(1, '#0a0f18');
    g.fillStyle = rail; g.fillRect(0, 336, 1024, 24);                            /* dado rail */
    g.save(); g.shadowColor = '#22d3ee'; g.shadowBlur = 12; g.fillStyle = 'rgba(103,232,249,.9)'; g.fillRect(0, 346, 1024, 3); g.restore();
    for (i = 0; i < 32; i++) {                                                   /* lower vent panels */
      var vx = i * 32;
      g.fillStyle = '#080c14'; g.fillRect(vx + 4, 372, 24, 124);
      g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(vx + 4, 372, 24, 4);
      for (var k = 0; k < 10; k++) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(vx + 8, 382 + k * 11, 16, 5);
        g.fillStyle = 'rgba(150,180,220,.10)'; g.fillRect(vx + 8, 387 + k * 11, 16, 1); }
    }
    return tex(c, true);
  }
  function ceilTex () {
    /* coffered ceiling: recessed square bays, lower edges catching light from the neon below */
    var c = cv(512, 512), g = c.getContext('2d'), i, j;
    g.fillStyle = '#05080e'; g.fillRect(0, 0, 512, 512);
    for (i = 0; i < 2; i++) { for (j = 0; j < 2; j++) {
      var x = i * 256, y = j * 256;
      g.fillStyle = '#121a28'; g.fillRect(x + 6, y + 6, 244, 244);
      g.fillStyle = 'rgba(190,215,250,.16)'; g.fillRect(x + 6, y + 247, 244, 3); g.fillRect(x + 247, y + 6, 3, 244);
      var gr = g.createLinearGradient(x, y + 30, x, y + 226); gr.addColorStop(0, '#04070c'); gr.addColorStop(1, '#0d1420');
      g.fillStyle = gr; g.fillRect(x + 30, y + 30, 196, 196);
      g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(x + 30, y + 30, 196, 8); g.fillRect(x + 30, y + 30, 8, 196);
      g.fillStyle = 'rgba(170,200,240,.12)'; g.fillRect(x + 30, y + 223, 196, 3);
      groove(g, chamRect(x + 70, y + 70, 116, 116, 14), 3);
      g.fillStyle = 'rgba(0,0,0,.6)'; for (var k = 0; k < 5; k++) { g.fillRect(x + 96 + k * 14, y + 112, 6, 32); }
    } }
    return tex(c, true);
  }
  function titleTex () {
    var c = cv(2048, 420), g = c.getContext('2d');
    g.textAlign = 'center';
    g.save(); g.shadowColor = '#22d3ee'; g.shadowBlur = 40;
    g.fillStyle = '#e0faff'; g.font = '800 190px system-ui, "Segoe UI", sans-serif'; g.fillText('INSIDE THE CLOUD', 1024, 210);
    g.restore();
    g.save(); g.shadowColor = '#f59e0b'; g.shadowBlur = 18;
    g.fillStyle = '#fbbf24'; g.font = '700 70px system-ui, "Segoe UI", sans-serif';
    g.fillText('CHOOSE A CHAPTER  ·  WALK THROUGH A DOOR', 1024, 330); g.restore();
    return tex(c);
  }
  function gateLabelTex (G) {
    var c = cv(1024, 360), g = c.getContext('2d');
    rr(g, 10, 10, 1004, 340, 30); g.fillStyle = 'rgba(4,8,16,.82)'; g.fill();
    g.lineWidth = 6; g.strokeStyle = G.col; g.stroke();
    g.textAlign = 'center';
    g.save(); g.shadowColor = G.col; g.shadowBlur = 24; g.fillStyle = G.col; g.font = '800 116px system-ui, sans-serif';
    g.fillText('CHAPTER ' + G.n, 512, 140); g.restore();
    g.fillStyle = '#f1f5f9'; g.font = '700 54px system-ui, sans-serif'; g.fillText(G.title, 512, 222);
    g.fillStyle = '#94a3b8'; g.font = '500 40px system-ui, sans-serif'; g.fillText(G.teaser, 512, 296);
    return tex(c);
  }
  function portalTex (col) {                /* bright rim, darker swirling centre */
    var c = cv(512, 640), g = c.getContext('2d');
    var gr = g.createRadialGradient(256, 340, 30, 256, 320, 380);
    gr.addColorStop(0, 'rgba(255,255,255,.03)'); gr.addColorStop(0.62, 'rgba(255,255,255,.07)'); gr.addColorStop(0.86, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 640);
    return tex(c);
  }
  var NOISE = (function () {                /* streaky energy texture, scrolled upward */
    var c = cv(256, 512), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
    var seed = 3; function r () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 220; i++) {
      var x = r() * 256, y = r() * 512, h = 20 + r() * 120, w = 1 + r() * 3;
      var gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.15 + r() * 0.5).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    }
    return tex(c, true);
  })();
  function drawStatus (s, now) {             /* console UI: a grid of status lights, no graphs */
    var g = s.S.g, w = s.S.c.width, h = s.S.c.height;
    g.fillStyle = '#03101a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = s.col; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = s.col; g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(s.title, 24, 50);
    g.fillStyle = '#34d399'; g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('ALL ONLINE', w - 24, 50);
    for (var r = 0; r < 4; r++) { for (var c = 0; c < 10; c++) {
      var on = Math.sin(now / 900 + r * 3.1 + c * 1.7) > -0.85, x = 28 + c * 46, y = 84 + r * 52;
      g.fillStyle = '#0b1a26'; g.fillRect(x, y, 36, 36);
      g.fillStyle = !on ? '#1e293b' : (r * 10 + c) % 13 === 0 ? '#fbbf24' : '#22c55e'; g.fillRect(x + 6, y + 6, 24, 24);
    } }
    s.S.t.needsUpdate = true;
  }
  function screenCanvas (w, h) { var c = cv(w, h); return { c: c, g: c.getContext('2d'), t: tex(c) }; }
  /* ---------- the hall ---------- */
  var shellEl, shell, refl;
  function buildShell () {
    shellEl = document.getElementById('shell'); shell = shellEl.object3D;
    refl = new THREE.Group(); refl.name = 'reflections'; shell.add(refl);
    var B = new Batch(), i, z;
    var wallM = basic({ map: wallTex() }), ceilM = basic({ map: ceilTex() });
    wallM.map.repeat.set(17 / 4.2, 1); ceilM.map.repeat.set(1.6, 17 / 3.4);
    /* floor: semi-transparent over mirrored glow (the "shiny" floor) */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, ZF - ZB).rotateX(-Math.PI / 2).translate(0, 0, (ZF + ZB) / 2),
      new THREE.MeshBasicMaterial({ map: floorTex(), transparent: true, opacity: 0.9, toneMapped: false }));
    floor.renderOrder = 1; shell.add(floor);
    refl.add(new THREE.Mesh(new THREE.PlaneGeometry(2 * W, ZF - ZB).rotateX(-Math.PI / 2).translate(0, -6, 0), basic({ color: '#010205' })));
    /* side walls */
    [-1, 1].forEach(function (s) {
      var wg = new THREE.PlaneGeometry(ZF - ZB, HW);
      B.add('wall', wallM, wg, mat4(s * W, HW / 2, (ZF + ZB) / 2, 0, -s * Math.PI / 2, 0));
      /* sloped ceiling panel from the wall top up to the flat centre */
      var dx = W - XC, dy = HC - HW, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      var sg = new THREE.PlaneGeometry(len, ZF - ZB).rotateX(Math.PI / 2);      /* lay flat (facing down), then tilt */
      B.add('ceil', ceilM, sg, mat4(s * (XC + dx / 2), HW + dy / 2, (ZF + ZB) / 2, 0, 0, -s * ang));
    });
    /* flat ceiling (centre channel) */
    B.add('ceil', ceilM, new THREE.PlaneGeometry(2 * XC, ZF - ZB), mat4(0, HC, (ZF + ZB) / 2, Math.PI / 2, 0, 0));
    /* back + front walls (solid dark, the back wall gets panels and the title) */
    var backM = std('#0c1220', 0.6, 0.55);
    var back = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, HC + 0.2).translate(0, (HC + 0.2) / 2, ZB), backM); shell.add(back);
    B.add('wall', wallM, new THREE.PlaneGeometry(2 * W, HW), mat4(0, HW / 2, ZF, 0, Math.PI, 0));
    B.add('ceil', ceilM, new THREE.PlaneGeometry(2 * W, HC - HW + 0.2), mat4(0, HW + (HC - HW) / 2, ZF, 0, Math.PI, 0));
    /* transverse ceiling ribs (dark metal) and wall pilasters */
    var ribM = std('#1a2232', 0.7, 0.45), pilM = std('#161e2c', 0.65, 0.5);
    for (z = ZB + 1.0; z < ZF; z += 1.7) {
      B.add('rib', ribM, new THREE.BoxGeometry(2 * XC, 0.12, 0.22), mat4(0, HC - 0.06, z));
      [-1, 1].forEach(function (s) {
        var dx = W - XC, dy = HC - HW, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        B.add('rib', ribM, new THREE.BoxGeometry(len, 0.12, 0.22), mat4(s * (XC + dx / 2), HW + dy / 2 - 0.06, z, 0, 0, -s * ang));
        B.add('pil', pilM, new THREE.BoxGeometry(0.34, HW, 0.42), mat4(s * (W - 0.17), HW / 2, z));
        B.add('pil', pilM, new THREE.BoxGeometry(0.5, 0.18, 0.5), mat4(s * (W - 0.25), 0.09, z));
      });
    }
    /* pipes along both walls */
    var pipeM = std('#3a4556', 0.8, 0.35);
    [-1, 1].forEach(function (s) {
      [[0.55, 0.07], [0.78, 0.05], [3.25, 0.09]].forEach(function (p) {
        B.add('pipe', pipeM, new THREE.CylinderGeometry(p[1], p[1], ZF - ZB, 12).rotateX(Math.PI / 2), mat4(s * (W - 0.5), p[0], (ZF + ZB) / 2));
      });
    });
    /* neon tubes. The centre pair runs straight to the title; the outer tubes run along the ceiling and,
       near the back, curve outward and down the slope towards the walls (as in the concept). */
    function ceilY (x) { var a = Math.abs(x); return a <= XC ? HC - 0.16 : HW + (W - a) / (W - XC) * (HC - HW) - 0.14; }
    var TUBES = [[0.55, 'c', 0], [2.55, 'o', 0.45], [4.35, 'c', 0.7], [5.8, 'o', 0.9]];
    var neonC = basic({ color: '#cffafe' }), neonO = basic({ color: '#fed7aa' }), capM = std('#2a3446', 0.85, 0.3);
    var haloC = addMat('#22d3ee', 0.28), haloO = addMat('#fb923c', 0.26);
    var streakC = addMat('#22d3ee', 0.10, STRIPGLOW), streakO = addMat('#fb923c', 0.09, STRIPGLOW);
    TUBES.forEach(function (tb) {
      [-1, 1].forEach(function (s) {
        var x0 = s * tb[0], pts = [], n = 26;
        for (var k = 0; k <= n; k++) {
          var z = ZF - 0.4 + (ZB + 0.45 - (ZF - 0.4)) * k / n, x = x0;
          var u = Math.max(0, (-1.5 - z) / (-1.5 - (ZB + 0.45)));             /* 0 before z=-1.5, 1 at the back */
          if (tb[2]) { x = x0 + s * (W - 0.15 - tb[0]) * tb[2] * u * u * (3 - 2 * u); }
          pts.push(new V3(x, ceilY(x), z));
        }
        var curve = new THREE.CatmullRomCurve3(pts), key = tb[1] === 'c' ? 'C' : 'O';
        B.add('neon' + key, key === 'C' ? neonC : neonO, new THREE.TubeGeometry(curve, 90, 0.028, 6, false));
        B.add('halo' + key, key === 'C' ? haloC : haloO, new THREE.TubeGeometry(curve, 90, 0.10, 8, false));
        /* end lamps so the tubes terminate in a fitting, not mid-air */
        var e0 = pts[pts.length - 1], e1 = pts[0];
        [e0, e1].forEach(function (e) {
          B.add('capM', capM, new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12).rotateX(Math.PI / 2), mat4(e.x, e.y, e.z));
          B.add('neon' + key, key === 'C' ? neonC : neonO, new THREE.SphereGeometry(0.05, 10, 8), mat4(e.x, e.y - 0.02, e.z));
          B.add('capGlow' + key, key === 'C' ? haloC : haloO, new THREE.SphereGeometry(0.22, 12, 8), mat4(e.x, e.y - 0.02, e.z));
        });
        /* hazy floor reflection: a soft streak right below the straight run */
        B.add('streak' + key, key === 'C' ? streakC : streakO, new THREE.PlaneGeometry(1.4, 10.5), mat4(x0, 0.006, 3.0, -Math.PI / 2, 0, 0));
      });
    });
    /* glowing floor line in front of the gates + cyan floor lanes (with hazy halos) */
    B.add('amber', addMat('#fb923c', 0.95, STRIPGLOW), new THREE.PlaneGeometry(11.4, 0.38), mat4(0, 0.012, -6.85, -Math.PI / 2, 0, 0));
    B.add('amberHaze', addMat('#f97316', 0.34, STRIPGLOW), new THREE.PlaneGeometry(12.4, 2.2), mat4(0, 0.010, -6.85, -Math.PI / 2, 0, 0));
    B.add('amberCore', basic({ color: '#ffedd5' }), new THREE.PlaneGeometry(11.0, 0.03), mat4(0, 0.014, -6.85, -Math.PI / 2, 0, 0));
    [-1, 1].forEach(function (s) {
      B.add('lane', addMat('#22d3ee', 0.55, STRIPGLOW), new THREE.PlaneGeometry(0.22, 14.5), mat4(s * 5.6, 0.011, 0.5, -Math.PI / 2, 0, 0));
      B.add('laneHaze', addMat('#22d3ee', 0.12, STRIPGLOW), new THREE.PlaneGeometry(1.4, 14.5), mat4(s * 5.6, 0.009, 0.5, -Math.PI / 2, 0, 0));
      B.add('laneCore', basic({ color: '#a5f3fc' }), new THREE.PlaneGeometry(0.025, 14.5), mat4(s * 5.6, 0.013, 0.5, -Math.PI / 2, 0, 0));
    });
    var meshes = B.flush(shell);
    /* floor-level glows must draw after the semi-transparent floor (renderOrder 1), or the floor hides them */
    ['amber', 'amberHaze', 'amberCore', 'lane', 'laneHaze', 'laneCore', 'streakC', 'streakO'].forEach(function (k) { if (meshes[k]) { meshes[k].renderOrder = 2; } });
    /* soft (not mirror-sharp) reflections: only the wide halos are mirrored, faintly */
    ['haloC', 'haloO'].forEach(function (k) {
      if (!meshes[k]) { return; }
      var m = meshes[k].clone(); m.material = meshes[k].material.clone(); m.material.opacity *= 0.35; m.scale.y = -1; refl.add(m);
    });
    /* title on the back wall */
    var title = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.15), basic({ map: titleTex(), transparent: true, depthWrite: false }));
    title.position.set(0, 4.38, ZB + 0.03); shell.add(title);
    var tglow = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.2), addMat('#22d3ee', 0.16, GLOW)); tglow.position.set(0, 4.4, ZB + 0.02); shell.add(tglow);
    var th = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 4.5).rotateX(-Math.PI / 2), addMat('#22d3ee', 0.10, GLOW)); th.position.set(0, 0.008, -5.6); th.renderOrder = 2; shell.add(th);
  }

  /* ---------- the three gates ---------- */
  function frameShape (w, h, c) {             /* rectangle with chamfered corners */
    var s = new THREE.Shape(), x = -w / 2, y = 0;
    s.moveTo(x + c, y); s.lineTo(x + w - c, y); s.lineTo(x + w, y + c); s.lineTo(x + w, y + h - c);
    s.lineTo(x + w - c, y + h); s.lineTo(x + c, y + h); s.lineTo(x, y + h - c); s.lineTo(x, y + c); s.closePath();
    return s;
  }
  function ringGeo (wo, ho, co, wi, hi, ci, yi, depth) {
    var s = frameShape(wo, ho, co), hole = frameShape(wi, hi, ci);
    var hp = new THREE.Path(hole.getPoints().map(function (p) { return new THREE.Vector2(p.x, p.y + yi); }).reverse());
    s.holes.push(hp);
    return new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false, curveSegments: 1 });
  }
  function buildGates () {
    var frameM = std('#1c2433', 0.75, 0.38), trimM = std('#2c3748', 0.8, 0.3);
    var B = new Batch();
    GATES.forEach(function (G) {
      var door = document.getElementById('door-ch' + G.n), d = door.object3D;
      var holder = new THREE.Group(); holder.position.set(G.x - d.position.x, 0, GZ - d.position.z); d.add(holder);
      /* heavy outer frame + side pillars (batched across gates, in world space) */
      B.add('frame', frameM, ringGeo(3.3, 3.55, 0.55, 2.3, 2.85, 0.38, 0.12, 0.45), mat4(G.x, 0, GZ - 0.2));
      B.add('trim', trimM, ringGeo(3.55, 3.75, 0.62, 3.3, 3.55, 0.55, 0.1, 0.22), mat4(G.x, 0, GZ - 0.3));
      [-1, 1].forEach(function (s) {
        B.add('frame', frameM, new THREE.BoxGeometry(0.42, 3.3, 0.6), mat4(G.x + s * 1.95, 1.65, GZ - 0.1));
        B.add('trim', trimM, new THREE.BoxGeometry(0.5, 0.26, 0.7), mat4(G.x + s * 1.95, 0.13, GZ - 0.1));
        B.add('trim', trimM, new THREE.BoxGeometry(0.5, 0.2, 0.7), mat4(G.x + s * 1.95, 3.38, GZ - 0.1));
      });
      /* inner glowing rim (coloured), outer accent lines */
      var hot = new THREE.Color(G.col).lerp(new THREE.Color('#ffffff'), 0.35);
      var rimM = basic({ color: hot });
      var rim = new THREE.Mesh(ringGeo(2.42, 2.97, 0.42, 2.3, 2.85, 0.38, 0.06, 0.06), rimM);
      rim.position.set(0, 0.06, 0.27); holder.add(rim);
      /* vibrant glow band hugging the rim, plus a lit edge around the outer trim */
      var band = new THREE.Mesh(ringGeo(2.78, 3.32, 0.5, 2.42, 2.97, 0.42, 0.18, 0.01), addMat(G.col, 0.75));
      band.position.set(0, -0.12, 0.28); holder.add(band);
      var edge = new THREE.Mesh(ringGeo(3.62, 3.82, 0.64, 3.55, 3.75, 0.62, 0.035, 0.01), basic({ color: hot }));
      edge.position.set(0, -0.035, -0.07); holder.add(edge);
      G.band = band;
      [-1, 1].forEach(function (s) {
        var slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 0.02), rimM); slit.position.set(s * 1.95, 1.65, 0.21); holder.add(slit);
      });
      /* portal surface: rim glow + scrolling energy */
      var pg = new THREE.ShapeGeometry(frameShape(2.3, 2.85, 0.38));
      var base = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: G.col, map: portalTex(G.col), transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      base.position.set(0, 0.18, 0.05); holder.add(base);
      var nt = NOISE.clone(); nt.needsUpdate = true; nt.repeat.set(1.4, 1);
      var energy = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: G.col, map: nt, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      energy.position.set(0, 0.18, 0.08); holder.add(energy);
      var dark = new THREE.Mesh(pg, basic({ color: '#02040a' })); dark.position.set(0, 0.18, -0.02); holder.add(dark);
      /* tunnel: glowing rings shrinking inward, so the portal reads as depth, not paint */
      [0.84, 0.68, 0.52, 0.36].forEach(function (k, i) {
        var tr = new THREE.Mesh(ringGeo(2.3 * k + 0.05, 2.85 * k + 0.05, 0.38 * k + 0.02, 2.3 * k, 2.85 * k, 0.38 * k, 0.025, 0.01),
          addMat(G.col, 0.55 - i * 0.11));
        tr.position.set(0, 0.18 + 2.85 * (1 - k) / 2 - 0.025, 0.0 - i * 0.012); holder.add(tr);
        (G.rings = G.rings || []).push(tr);
      });
      var core = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), addMat(G.col, 0.5, GLOW)); core.position.set(0, 1.55, -0.005); holder.add(core);
      /* floor pad + light spill in front of the gate */
      var pad = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.9).rotateX(-Math.PI / 2), addMat(G.col, 0.7, GLOW));
      pad.position.set(0, 0.02, 1.0); pad.renderOrder = 2; holder.add(pad);
      var spill = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 3.2), addMat(G.col, 0.32, VFADE)); spill.position.set(0, 1.5, 0.35); holder.add(spill);
      var halo = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), addMat(G.col, 0.32, GLOW)); halo.position.set(0, 1.6, 0.02); holder.add(halo);
      /* label plate inside the top of the gate */
      var lab = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.74), basic({ map: gateLabelTex(G), transparent: true, depthWrite: false }));
      lab.position.set(0, 2.42, 0.32); holder.add(lab);
      /* reflection of the glow under the floor */
      var rg = new THREE.Group(); rg.position.set(G.x, 0, GZ); rg.scale.y = -1; refl.add(rg);
      [base, band].forEach(function (m) { var c = m.clone(); c.material = m.material.clone(); c.material.side = THREE.DoubleSide;
        c.material.transparent = true; c.material.opacity = (c.material.opacity || 1) * 0.22; rg.add(c); });
      /* the wet-floor streak: a soft column of the gate's colour stretching towards you */
      var streak = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.5).rotateX(-Math.PI / 2), addMat(G.col, 0.42, VFADE));
      streak.rotation.y = Math.PI; streak.position.set(0, 0.007, 3.4); streak.renderOrder = 2; holder.add(streak);
      var streak2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 7.5).rotateX(-Math.PI / 2), addMat(hot, 0.3, VFADE));
      streak2.rotation.y = Math.PI; streak2.position.set(0, 0.008, 3.9); streak2.renderOrder = 2; holder.add(streak2);
      FX.portals.push({ energy: energy, base: base, tex: nt, phase: G.n, rings: G.rings, band: band });
      /* invisible click target filling the gate (the laser can always hit it) */
      var hit = document.createElement('a-entity');
      hit.setAttribute('geometry', 'primitive: plane; width: 2.4; height: 3.0');
      hit.setAttribute('material', 'visible: false');
      hit.setAttribute('position', (G.x - d.position.x) + ' 1.6 ' + (GZ + 0.35 - d.position.z));
      door.appendChild(hit);
    });
    B.flush(shell);
  }

  /* ---------- back wall decor (no graphs): lit vent boxes above the side gates ---------- */
  function buildBackDecor () {
    var B = new Batch(), boxM = std('#151d2b', 0.75, 0.4), slatM = std('#0a0f17', 0.5, 0.6);
    [-4.2, 4.2].forEach(function (x) {
      B.add('box', boxM, new THREE.BoxGeometry(1.7, 0.62, 0.16), mat4(x, 4.3, ZB + 0.08));
      for (var k = 0; k < 6; k++) { B.add('slat', slatM, new THREE.BoxGeometry(1.4, 0.04, 0.04), mat4(x, 4.1 + k * 0.08, ZB + 0.17)); }
      var bar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.025), basic({ color: '#a5f3fc' })); bar.position.set(x, 4.03, ZB + 0.175); shell.add(bar);
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), addMat('#22d3ee', 0.14, GLOW)); gl.position.set(x, 4.1, ZB + 0.17); shell.add(gl);
    });
    [-6.05, 6.05].forEach(function (x) {                       /* tall light columns at the outer corners */
      B.add('box', boxM, new THREE.BoxGeometry(0.3, 2.6, 0.16), mat4(x, 1.9, ZB + 0.08));
      var l = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 2.3), basic({ color: '#fdba74' })); l.position.set(x, 1.9, ZB + 0.17); shell.add(l);
      var lg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.8), addMat('#fb923c', 0.18, GLOW)); lg.position.set(x, 1.9, ZB + 0.165); shell.add(lg);
    });
    B.flush(shell);
  }

  /* ---------- light particles: around the gates and flowing along the floor lights ---------- */
  function buildParticles () {
    var P = [], c3 = new THREE.Color();
    GATES.forEach(function (G) {                              /* motes orbiting each gate frame */
      for (var i = 0; i < 150; i++) {
        P.push({ k: 'gate', cx: G.x, a: Math.random() * TAU, sp: (0.12 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1),
          rx: 1.55 + Math.random() * 0.55, ry: 1.75 + Math.random() * 0.55, z: GZ + 0.35 + Math.random() * 0.9,
          w: Math.random() * TAU, col: c3.set(G.col).clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.4) });
      }
    });
    for (var j = 0; j < 160; j++) {                             /* amber line: sparks drifting along it and rising */
      P.push({ k: 'line', x: -5.7 + Math.random() * 11.4, z: -6.85 + (Math.random() - 0.5) * 0.5, y: Math.random(), sp: 0.15 + Math.random() * 0.3,
        dx: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.4), col: new THREE.Color(Math.random() < 0.7 ? '#fdba74' : '#fff7ed') });
    }
    [-1, 1].forEach(function (s) {                              /* cyan lanes: motes flowing towards the gates */
      for (var k = 0; k < 90; k++) {
        P.push({ k: 'lane', x: s * 5.6 + (Math.random() - 0.5) * 0.35, z: -6.8 + Math.random() * 14.6, y: Math.random(), sp: 0.1 + Math.random() * 0.2,
          dz: -(0.35 + Math.random() * 0.5), col: new THREE.Color(Math.random() < 0.7 ? '#67e8f9' : '#e0f7ff') });
      }
    });
    var n = P.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    P.forEach(function (q, i) { col[i * 3] = q.col.r; col[i * 3 + 1] = q.col.g; col[i * 3 + 2] = q.col.b; });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, map: GLOW, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    pts.frustumCulled = false; pts.renderOrder = 6; shell.add(pts);
    FX.motes = { P: P, geo: geo };
    moteTick(0, performance.now());
  }
  function moteTick (k, now) {
    var M = FX.motes; if (!M) { return; }
    var a = M.geo.attributes.position.array;
    for (var i = 0; i < M.P.length; i++) {
      var q = M.P[i], x, y, z;
      if (q.k === 'gate') {
        q.a += q.sp * k;
        var wob = Math.sin(now / 900 + q.w) * 0.12;
        x = q.cx + Math.cos(q.a) * (q.rx + wob); y = 1.65 + Math.sin(q.a) * (q.ry + wob) + Math.sin(now / 1300 + q.w) * 0.1;
        z = q.z + Math.sin(now / 1100 + q.w * 2) * 0.15;
        if (y < 0.05) { y = 0.05 + (0.05 - y) * 0.3; }
      } else if (q.k === 'line') {
        q.y += q.sp * k; q.x += q.dx * k * 0.5;
        if (q.y > 1) { q.y = 0; q.x = -5.7 + Math.random() * 11.4; }
        if (q.x > 5.8) { q.x -= 11.6; } if (q.x < -5.8) { q.x += 11.6; }
        x = q.x + Math.sin(now / 500 + i) * 0.03; y = 0.02 + q.y * q.y * 1.1; z = q.z;
      } else {
        q.y += q.sp * k; q.z += q.dz * k;
        if (q.y > 1) { q.y = 0; }
        if (q.z < -6.8) { q.z += 14.6; }
        x = q.x + Math.sin(now / 700 + i) * 0.04; y = 0.02 + q.y * q.y * 0.7; z = q.z;
      }
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    M.geo.attributes.position.needsUpdate = true;
  }

  /* =================== props =================== */
  function flowTex (col) {                   /* dashes of light that slide along a pipe */
    var c = cv(256, 8), g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, 256, 8);
    for (var i = 0; i < 2; i++) { var gr = g.createLinearGradient(i * 128, 0, i * 128 + 110, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(i * 128, 0, 110, 8); }
    return tex(c, true);
  }
  function glassTex () {                     /* faint glass with two soft specular streaks and bright rims */
    var c = cv(512, 256), g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, 0, 512, 256);
    [[60, 22, .55], [92, 8, .35], [300, 14, .25]].forEach(function (s) {
      var gr = g.createLinearGradient(s[0] - s[1], 0, s[0] + s[1], 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + s[2] + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(s[0] - s[1], 0, s[1] * 2, 256);
    });
    var v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,.55)'); v.addColorStop(0.06, 'rgba(255,255,255,0)');
    v.addColorStop(0.94, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(255,255,255,.55)');
    g.fillStyle = v; g.fillRect(0, 0, 512, 256);
    return tex(c, true);
  }
  function coolantTex () {                   /* brighter at the bottom where the heat goes in, soft bands */
    var c = cv(64, 256), g = c.getContext('2d');
    var v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,.35)'); v.addColorStop(0.15, 'rgba(255,255,255,.5)');
    v.addColorStop(0.8, 'rgba(255,255,255,.75)'); v.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 256);
    for (var i = 0; i < 9; i++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, i * 28 + 6, 64, 6); }
    return tex(c, true);
  }
  function buildTank () {
    var T = new THREE.Group(); T.position.set(4.75, 0, -1.6); T.name = 'coolingTank'; shell.add(T);
    var R = 0.72, Y0 = 0.62, H = 2.05, B = new Batch();
    var metal = std('#2a3342', 0.85, 0.3), dark = std('#141a24', 0.7, 0.5), bright = std('#9aa7b8', 0.95, 0.22);
    /* pump plinth: stepped base, vents, bolts */
    B.add('dark', dark, new THREE.CylinderGeometry(1.02, 1.1, 0.18, 40), mat4(0, 0.09, 0));
    B.add('metal', metal, new THREE.CylinderGeometry(0.92, 0.98, 0.34, 40), mat4(0, 0.35, 0));
    B.add('bright', bright, new THREE.CylinderGeometry(0.82, 0.86, 0.1, 40), mat4(0, 0.56, 0));
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * TAU;
      B.add('dark', dark, new THREE.BoxGeometry(0.05, 0.22, 0.12), mat4(Math.sin(a) * 0.96, 0.35, Math.cos(a) * 0.96, 0, a, 0));
      B.add('bright', bright, new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), mat4(Math.sin(a + 0.26) * 0.78, 0.62, Math.cos(a + 0.26) * 0.78));
    }
    /* glass column: frame rings top/bottom + 4 struts */
    [Y0, Y0 + H].forEach(function (y) {
      B.add('bright', bright, new THREE.TorusGeometry(R + 0.03, 0.045, 10, 48).rotateX(Math.PI / 2), mat4(0, y, 0));
      B.add('metal', metal, new THREE.CylinderGeometry(R + 0.09, R + 0.09, 0.1, 40), mat4(0, y + (y === Y0 ? -0.03 : 0.05), 0));
    });
    for (i = 0; i < 4; i++) {
      var b = i / 4 * TAU + Math.PI / 4;
      B.add('metal', metal, new THREE.CylinderGeometry(0.035, 0.035, H, 10), mat4(Math.sin(b) * (R + 0.07), Y0 + H / 2, Math.cos(b) * (R + 0.07)));
    }
    /* top cap with a dome and valve */
    B.add('metal', metal, new THREE.CylinderGeometry(R + 0.1, R + 0.12, 0.22, 40), mat4(0, Y0 + H + 0.2, 0));
    B.add('dark', dark, new THREE.SphereGeometry(R * 0.82, 32, 12, 0, TAU, 0, Math.PI / 2), mat4(0, Y0 + H + 0.3, 0, 0, 0, 0, 1, 0.45, 1));
    B.add('bright', bright, new THREE.CylinderGeometry(0.09, 0.09, 0.28, 16), mat4(0, Y0 + H + 0.6, 0));
    B.add('bright', bright, new THREE.TorusGeometry(0.16, 0.025, 8, 24).rotateX(Math.PI / 2), mat4(0, Y0 + H + 0.76, 0));
    B.flush(T);
    /* coolant: glowing liquid column + bright core */
    var ct = coolantTex();
    /* darker water: a translucent deep-teal body (normal blending), with only a faint glow inside it */
    var water = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.04, R - 0.04, H - 0.1, 40, 1, false),
      new THREE.MeshBasicMaterial({ color: '#042523', transparent: true, opacity: 0.74, depthWrite: false, toneMapped: false }));
    water.position.y = Y0 + H / 2 - 0.02; water.renderOrder = 2; T.add(water);
    var liquid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, H - 0.12, 40, 1, true),
      addMat('#0d9488', 0.16, ct)); liquid.position.y = Y0 + H / 2 - 0.02; liquid.renderOrder = 3; T.add(liquid);
    var core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, H - 0.2, 24, 1, true), addMat('#5eead4', 0.14, ct));
    core.position.y = Y0 + H / 2; T.add(core);
    var surf = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 40).rotateX(-Math.PI / 2), addMat('#2dd4bf', 0.3, GLOW));
    surf.position.y = Y0 + H - 0.1; T.add(surf);
    /* heat-exchanger coil (glowing orange: the hot side) */
    var pts = []; for (i = 0; i <= 160; i++) { var u = i / 160, ang = u * 6.5 * TAU;
      pts.push(new V3(Math.cos(ang) * 0.46, Y0 + 0.18 + u * (H - 0.5), Math.sin(ang) * 0.46)); }
    var cc2 = cv(8, 128), cg2 = cc2.getContext('2d'), sh = cg2.createLinearGradient(0, 0, 0, 128);
    sh.addColorStop(0, '#2a0d03'); sh.addColorStop(0.32, '#9a3412'); sh.addColorStop(0.45, '#ea580c'); sh.addColorStop(0.485, '#fed7aa');
    sh.addColorStop(0.5, '#ffffff'); sh.addColorStop(0.515, '#fed7aa'); sh.addColorStop(0.56, '#ea580c'); sh.addColorStop(0.7, '#9a3412'); sh.addColorStop(1, '#2a0d03');
    cg2.fillStyle = sh; cg2.fillRect(0, 0, 8, 128);
    var coilTex = tex(cc2); coilTex.wrapS = coilTex.wrapT = THREE.RepeatWrapping;
    var coilGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.036, 12, false);
    var coil = new THREE.Mesh(coilGeo, basic({ map: coilTex })); T.add(coil);     /* glossy copper: bright highlight along the tube */
    var coilSheen = new THREE.Mesh(coilGeo, addMat('#fb923c', 0.10)); T.add(coilSheen);
    var coilGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, H - 0.4, 32, 1, true), addMat('#fb923c', 0.08, VFADE));
    coilGlow.position.y = Y0 + H / 2; T.add(coilGlow);
    /* glass (drawn last among the tank parts so the liquid shows through) */
    var glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true), new THREE.MeshBasicMaterial({ color: '#cffafe',
      map: glassTex(), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending }));
    glass.position.y = Y0 + H / 2; glass.renderOrder = 4; T.add(glass);
    /* rising bubbles */
    var N = 140, pos = new Float32Array(N * 3), seeds = [];
    for (i = 0; i < N; i++) { var rr0 = Math.sqrt(Math.random()) * (R - 0.12), aa = Math.random() * TAU;
      seeds.push({ x: Math.cos(aa) * rr0, z: Math.sin(aa) * rr0, y: Math.random(), sp: 0.12 + Math.random() * 0.22, w: Math.random() * TAU }); }
    var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.045, map: GLOW, color: '#e0fffa', transparent: true,
      opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    bubbles.frustumCulled = false; bubbles.renderOrder = 5; T.add(bubbles);
    FX.bubbles = { geo: bg, seeds: seeds, y0: Y0 + 0.1, h: H - 0.3 };
    var dot = cv(32, 32), dg = dot.getContext('2d'); dg.fillStyle = '#fff'; dg.beginPath(); dg.arc(16, 16, 13, 0, TAU); dg.fill();
    var NS = 320, spos = new Float32Array(NS * 3), scol = new Float32Array(NS * 3), sseed = [], tc = new THREE.Color();
    for (i = 0; i < NS; i++) { var sr = Math.sqrt(Math.random()) * (R - 0.1), sa = Math.random() * TAU;
      sseed.push({ x: Math.cos(sa) * sr, z: Math.sin(sa) * sr, y: Y0 + 0.15 + Math.random() * (H - 0.35), w: Math.random() * TAU, sp: 0.02 + Math.random() * 0.05 });
      tc.set(['#16302d', '#24423e', '#3c5753', '#0f1f1d'][i % 4]); scol[i * 3] = tc.r; scol[i * 3 + 1] = tc.g; scol[i * 3 + 2] = tc.b; }
    var sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    var specks = new THREE.Points(sgeo, new THREE.PointsMaterial({ size: 0.028, map: tex(dot), vertexColors: true, transparent: true,
      alphaTest: 0.5, toneMapped: false }));                    /* matte specks: normal blending, no glow */
    specks.frustumCulled = false; specks.renderOrder = 3; T.add(specks);
    FX.specks = { geo: sgeo, seeds: sseed, y0: Y0 + 0.15, y1: Y0 + H - 0.2, R: R - 0.1 };
    /* pipes: cold supply from the top into the wall, hot return at the base */
    function pipe (points, r, col, speed) {
      var curve = new THREE.CatmullRomCurve3(points);
      var shellP = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 10, false), std('#2b3443', 0.85, 0.32)); T.add(shellP);
      var ft = flowTex('rgba(255,255,255,1)'); ft.repeat.set(curve.getLength() * 0.8, 1);
      var glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r * 1.12, 10, false),
        new THREE.MeshBasicMaterial({ color: col, map: ft, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
          depthWrite: false, toneMapped: false }));
      T.add(glow); FX.flows.push({ t: ft, sp: speed });
    }
    pipe([new V3(0, Y0 + H + 0.74, 0), new V3(0, 3.55, 0), new V3(0.6, 3.75, 0.1), new V3(1.55, 3.6, 0.15)], 0.07, '#22d3ee', 0.8);
    pipe([new V3(0.55, 0.3, 0.55), new V3(0.95, 0.22, 0.75), new V3(1.45, 0.25, 0.8), new V3(1.6, 0.55, 0.8)], 0.06, '#fb923c', -0.6);
    pipe([new V3(0.62, 0.3, -0.5), new V3(1.1, 0.3, -0.75), new V3(1.58, 0.45, -0.8)], 0.05, '#22d3ee', 0.7);
    /* floor glow + lights on the plinth */
    var pool = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48).rotateX(-Math.PI / 2), addMat('#14b8a6', 0.28, GLOW)); pool.position.y = 0.02; pool.renderOrder = 2; T.add(pool);
    var halo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.8), addMat('#2dd4bf', 0.16, GLOW)); halo.position.set(0, 1.6, 0);
    halo.userData.face = true; T.add(halo); FX.tankHalo = halo;
    var ledGeo = new THREE.BoxGeometry(0.06, 0.03, 0.02);
    for (i = 0; i < 8; i++) { var a2 = Math.PI + (i - 3.5) * 0.11;
      var led = new THREE.Mesh(ledGeo, basic({ color: i % 3 === 0 ? '#fb923c' : '#34d399' }));
      led.position.set(Math.sin(a2) * 0.935, 0.42, Math.cos(a2) * 0.935); led.rotation.y = a2; T.add(led); FX.leds.push(led); }
    /* status gauge on the plinth front (faces the corridor centre: -x) */
    var S = screenCanvas(512, 256);
    var gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), basic({ map: S.t }));
    gauge.position.set(-0.99, 0.36, 0); gauge.rotation.y = -Math.PI / 2; T.add(gauge);
    FX.tank = { S: S, liquid: liquid, core: core, coil: coil };
    /* the reflection of the glowing column */
    var rg = new THREE.Group(); rg.position.copy(T.position); rg.scale.y = -1; refl.add(rg);
    [liquid, core].forEach(function (m) { var c2 = m.clone(); c2.material = m.material.clone(); c2.material.transparent = true;
      c2.material.opacity = (m.material.opacity || 1) * 0.3; c2.material.side = THREE.DoubleSide; rg.add(c2); });
    /* sign */
    var sc = cv(512, 96), sg = sc.getContext('2d');
    sg.fillStyle = 'rgba(4,10,18,.9)'; sg.fillRect(0, 0, 512, 96); sg.strokeStyle = '#2dd4bf'; sg.lineWidth = 4; sg.strokeRect(2, 2, 508, 92);
    sg.fillStyle = '#5eead4'; sg.font = '700 40px system-ui, sans-serif'; sg.textAlign = 'center'; sg.fillText('LIQUID COOLING LOOP', 256, 62);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.21), basic({ map: tex(sc) })); sign.position.set(-0.86, Y0 + H + 0.22, 0);
    sign.rotation.y = -Math.PI / 2; T.add(sign);
  }
  function drawGauge (now) {
    var S = FX.tank.S, g = S.g;
    g.fillStyle = '#03121a'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#2dd4bf'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 248);
    var temp = 24 + 1.2 * Math.sin(now / 3000), flow = 38 + 3 * Math.sin(now / 1700), load = 62 + 8 * Math.sin(now / 2500);
    g.fillStyle = '#5eead4'; g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText('COOLANT LOOP', 22, 46);
    g.fillStyle = '#34d399'; g.fillText('PUMP OK', 340, 46);
    g.fillStyle = '#e2e8f0'; g.font = '600 34px system-ui, sans-serif';
    g.fillText('IN  ' + temp.toFixed(1) + ' °C', 22, 104); g.fillText('OUT ' + (temp + 9.5).toFixed(1) + ' °C', 22, 150);
    g.fillText('FLOW ' + flow.toFixed(0) + ' L/min', 262, 104); g.fillText('HEAT ' + load.toFixed(0) + ' kW', 262, 150);
    g.fillStyle = 'rgba(51,65,85,.9)'; g.fillRect(22, 190, 468, 22);
    g.fillStyle = '#fb923c'; g.fillRect(22, 190, 468 * load / 100, 22);
    S.t.needsUpdate = true;
  }

  function buildBench () {
    var G = new THREE.Group(); G.position.set(-5.35, 0, 1.4); G.rotation.y = Math.PI / 2; shell.add(G);
    var B = new Batch(), metal = std('#26303f', 0.85, 0.3), pad = std('#3b4658', 0.3, 0.7), bright = std('#9aa7b8', 0.95, 0.22);
    B.add('metal', metal, new THREE.BoxGeometry(2.5, 0.08, 0.7), mat4(0, 0.42, 0));
    B.add('pad', pad, new THREE.BoxGeometry(2.4, 0.09, 0.62), mat4(0, 0.5, 0.02));
    B.add('pad', pad, new THREE.BoxGeometry(2.4, 0.5, 0.09), mat4(0, 0.82, -0.3, -0.18, 0, 0));
    B.add('metal', metal, new THREE.BoxGeometry(2.5, 0.06, 0.12), mat4(0, 1.08, -0.35, -0.18, 0, 0));
    [-1.05, 1.05].forEach(function (x) {
      B.add('metal', metal, new THREE.BoxGeometry(0.1, 0.42, 0.62), mat4(x, 0.21, 0));
      B.add('bright', bright, new THREE.BoxGeometry(0.12, 0.04, 0.66), mat4(x, 0.02, 0));
      B.add('metal', metal, new THREE.BoxGeometry(0.1, 0.22, 0.5), mat4(x * 1.08, 0.62, 0.02));
    });
    B.flush(G);
    var under = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.04), basic({ color: '#67e8f9' })); under.position.set(0, 0.37, 0.351); G.add(under);
    var spill = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.3).rotateX(-Math.PI / 2), addMat('#22d3ee', 0.35, GLOW)); spill.position.set(0, 0.02, 0.15); G.add(spill);
  }
  function buildConsoles () {
    var B = new Batch(), metal = std('#1d2533', 0.8, 0.35), bright = std('#8b98aa', 0.9, 0.25);
    /* standing console with a tilted holo screen, left side near the gates */
    [[-5.35, -5.0, Math.PI / 2, 0], [5.4, 3.6, -Math.PI / 2, 1]].forEach(function (c, i) {
      var G = new THREE.Group(); G.position.set(c[0], 0, c[1]); G.rotation.y = c[2]; shell.add(G);
      var b2 = new Batch();
      b2.add('metal', metal, new THREE.BoxGeometry(0.9, 0.95, 0.5), mat4(0, 0.475, 0));
      b2.add('metal', metal, new THREE.BoxGeometry(1.0, 0.08, 0.62), mat4(0, 0.99, 0.02, -0.35, 0, 0));
      b2.add('bright', bright, new THREE.BoxGeometry(0.92, 0.03, 0.04), mat4(0, 0.9, 0.27));
      b2.flush(G);
      var S = screenCanvas(512, 320);
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), basic({ map: S.t }));
      scr.position.set(0, 1.33, -0.05); scr.rotation.x = -0.25; G.add(scr);
      var holo = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.85), addMat('#22d3ee', 0.14, GLOW)); holo.position.set(0, 1.33, -0.07); holo.rotation.x = -0.25; G.add(holo);
      var keys = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), addMat('#22d3ee', 0.4, GLOW)); keys.position.set(0, 1.04, 0.05); keys.rotation.x = -Math.PI / 2 + 0.35; G.add(keys);
      FX.status.push({ S: S, col: i ? '#fb923c' : '#22d3ee', title: i ? 'COOLING LOOP' : 'RACK STATUS' });
    });
    /* (build 29: the wall-mounted graph screens were removed) */
    B.flush(shell);
  }
  function buildCameras () {
    var B = new Batch(), body = std('#d6dde6', 0.4, 0.45), dark = std('#11161f', 0.6, 0.4);
    [-1, 1].forEach(function (s) {
      var x = s * 5.2, y = 4.0, z = -7.7;
      B.add('dark', dark, new THREE.BoxGeometry(0.08, 0.3, 0.08), mat4(x, y + 0.12, z));
      B.add('body', body, new THREE.BoxGeometry(0.22, 0.17, 0.36), mat4(x - s * 0.05, y - 0.08, z + 0.12, -0.35, -s * 0.5, 0));
      B.add('dark', dark, new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16).rotateX(Math.PI / 2), mat4(x - s * 0.13, y - 0.14, z + 0.3, -0.35, -s * 0.5, 0));
      var led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), basic({ color: '#ef4444' })); led.position.set(x - s * 0.02, y - 0.02, z + 0.27); shell.add(led);
      var lg = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), addMat('#ef4444', 0.8, GLOW)); lg.position.copy(led.position); lg.position.z += 0.01; shell.add(lg);
      FX.leds.push(lg);
    });
    B.flush(shell);
  }
  function buildCables () {
    /* drooping cable bundles between the pilasters on the left wall (concept: left wall cabling) */
    var B = new Batch(), rubber = std('#0d1118', 0.2, 0.8), lit = basic({ color: '#0e7490' });
    for (var z = ZB + 1.0; z < 6.0; z += 1.7) {
      for (var k = 0; k < 4; k++) {
        var x = -(W - 0.32 - k * 0.05), y0 = 3.0 - k * 0.06, sag = 0.35 + k * 0.08;
        var curve = new THREE.QuadraticBezierCurve3(new V3(x, y0, z + 0.2), new V3(x, y0 - sag * 2, z + 0.85), new V3(x, y0, z + 1.5));
        B.add(k === 2 ? 'lit' : 'rub', k === 2 ? lit : rubber, new THREE.TubeGeometry(curve, 14, k === 2 ? 0.018 : 0.03, 5, false));
      }
    }
    /* back wall: conduits + vents framing the gates */
    var metal = std('#1d2533', 0.8, 0.35), vent = std('#0e131c', 0.5, 0.6);
    B.add('metal', metal, new THREE.BoxGeometry(2 * W, 0.12, 0.2), mat4(0, 0.2, ZB + 0.1));
    B.add('metal', metal, new THREE.BoxGeometry(2 * W, 0.1, 0.18), mat4(0, 3.82, ZB + 0.09));
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 3; i++) { B.add('metal', metal, new THREE.CylinderGeometry(0.06, 0.06, 3.7, 10), mat4(s * (6.1 - i * 0.16), 1.85, ZB + 0.12)); }
      for (var j = 0; j < 6; j++) { B.add('vent', vent, new THREE.BoxGeometry(0.9, 0.06, 0.06), mat4(s * 2.1, 0.6 + j * 0.12, ZB + 0.05)); }
    });
    B.flush(shell);
  }
  window.LOBBY_PROPS = function () {
    buildTank(); buildBench(); buildConsoles(); buildCameras(); buildCables();
    drawGauge(performance.now());
    FX.status.forEach(function (s) { drawStatus(s, performance.now()); });
  };
  var lastGauge = 0, camV = new V3(), hp = new V3();
  window.LOBBY_TICK2 = function (t, dt, now) {
    var k = (dt || 16) / 1000;
    if (FX.bubbles) {
      var a = FX.bubbles.geo.attributes.position.array, B = FX.bubbles;
      for (var i = 0; i < B.seeds.length; i++) {
        var s = B.seeds[i]; s.y += s.sp * k / B.h; if (s.y > 1) { s.y -= 1; }
        a[i * 3] = s.x + Math.sin(now / 400 + s.w) * 0.02; a[i * 3 + 1] = B.y0 + s.y * B.h; a[i * 3 + 2] = s.z;
      }
      B.geo.attributes.position.needsUpdate = true;
    }
    if (FX.specks) {
      var sa2 = FX.specks.geo.attributes.position.array, SP = FX.specks;
      for (var j = 0; j < SP.seeds.length; j++) {
        var q = SP.seeds[j]; q.y += Math.sin(now / 2600 + q.w) * k * q.sp;
        if (q.y > SP.y1) { q.y = SP.y0; } if (q.y < SP.y0) { q.y = SP.y1; }
        sa2[j * 3] = q.x + Math.sin(now / 1900 + q.w) * 0.03; sa2[j * 3 + 1] = q.y; sa2[j * 3 + 2] = q.z + Math.cos(now / 2300 + q.w) * 0.03;
      }
      SP.geo.attributes.position.needsUpdate = true;
    }
    FX.flows.forEach(function (f) { f.t.offset.x -= k * f.sp; });
    if (FX.tank) {
      FX.tank.liquid.material.map.offset.y -= k * 0.05;
      FX.tank.core.material.opacity = 0.3 + 0.08 * Math.sin(now / 600);
      if (now - lastGauge > 500) { lastGauge = now; drawGauge(now); }
    }
    FX.leds.forEach(function (l, i) { l.visible = Math.sin(now / (300 + i * 37) + i) > -0.6; });
    var cam = document.querySelector('a-scene').camera;
    if (cam && FX.tankHalo) { cam.getWorldPosition(camV); FX.tankHalo.getWorldPosition(hp);
      FX.tankHalo.rotation.y = Math.atan2(camV.x - hp.x, camV.z - hp.z); }
  };

  window.LOBBY_BUILD = { cv: cv, tex: tex, basic: basic, addMat: addMat, std: std, rr: rr, GLOW: GLOW, STRIPGLOW: STRIPGLOW,
    VFADE: VFADE, Batch: Batch, mat4: mat4, FX: FX, shell: function () { return shell; }, refl: function () { return refl; },
    screenCanvas: screenCanvas, W: W, ZB: ZB, ZF: ZF, HW: HW, HC: HC, XC: XC };

  /* ---------- animation ---------- */
  var lastScreen = 0, si = 0;
  window.LOBBY_TICK = function (t, dt) {
    var now = performance.now(), k = (dt || 16) / 1000;
    FX.portals.forEach(function (p) {
      p.tex.offset.y -= k * 0.35; p.tex.offset.x = Math.sin(now / 2300 + p.phase) * 0.08;
      p.energy.material.opacity = 0.24 + 0.08 * Math.sin(now / 420 + p.phase);
      p.base.material.opacity = 0.88 + 0.12 * Math.sin(now / 700 + p.phase * 2);
      if (p.band) { p.band.material.opacity = 0.6 + 0.25 * Math.sin(now / 520 + p.phase); }
      if (p.rings) { p.rings.forEach(function (r, i) {      /* rings pulse inward, one after another */
        r.material.opacity = 0.12 + 0.4 * Math.pow(0.5 + 0.5 * Math.sin(now / 380 - i * 1.1 + p.phase), 2); }); }
    });
    if (now - lastScreen > 600 && FX.status.length) {             /* one console per slot: small uploads */
      lastScreen = now; drawStatus(FX.status[si++ % FX.status.length], now);
    }
    moteTick(k, now);
    if (window.LOBBY_TICK2) { window.LOBBY_TICK2(t, dt, now); }
  };

  function build () {
    buildShell(); buildGates(); buildBackDecor(); buildParticles();
    if (window.LOBBY_PROPS) { try { window.LOBBY_PROPS(); } catch (e) { console.error('props', e); } }
    window.LOBBY.built = true;
  }
  var sc = document.querySelector('a-scene');
  if (sc.hasLoaded) { build(); } else { sc.addEventListener('loaded', build); }

  /* build 34: lobby as an AR table model. Ceiling, neon, walls, pilasters, wall pipes and
     the mirrored floor reflections are hidden, so you can look into the corridor; the
     floor, the three gates, the back wall and the props stay. */
  var AR_HIDE = /^(reflections|batch:(wall|ceil|rib|pil|pipe|neonC|neonO|haloC|haloO|capM|capGlowC|capGlowO|slat|dark|body))$/;
  var arHidden = [];
  window.LOBBY_AR = function (on) {
    var shell = document.getElementById('shell');
    if (!shell) { return; }
    if (on) {
      if (arHidden.length) { return; }
      shell.object3D.updateMatrixWorld(true);
      shell.object3D.children.forEach(function (c) {
        var high = new THREE.Box3().setFromObject(c).min.y > 3.0;      /* anything that lives up at the ceiling */
        if ((AR_HIDE.test(c.name || '') || high) && c.visible) { c.visible = false; arHidden.push(c); }
      });
    } else {
      arHidden.forEach(function (c) { c.visible = true; }); arHidden = [];
    }
  };
  sc.addEventListener('enter-vr', function () { if (sc.is('ar-mode')) { window.LOBBY_AR(true); } });
  sc.addEventListener('exit-vr', function () { window.LOBBY_AR(false); });
})();
