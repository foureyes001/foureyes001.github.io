/* ==========================================================================
   build 28: the lobby as a sci-fi corridor (concept: neon-ribbed ceiling,
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
  var FX = { portals: [], screens: [], bubbles: null, flows: [], leds: [], tank: null, t: 0 };

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
  function floorTex () {
    var c = cv(1024, 1024), g = c.getContext('2d'), i, j;
    g.fillStyle = '#05080e'; g.fillRect(0, 0, 1024, 1024);
    for (i = 0; i < 4; i++) { for (j = 0; j < 4; j++) {                    /* 4x4 tiles, bevelled */
      var x = i * 256, y = j * 256, gr = g.createLinearGradient(x, y, x + 256, y + 256);
      gr.addColorStop(0, '#0b111c'); gr.addColorStop(1, '#070b13');
      g.fillStyle = gr; g.fillRect(x + 6, y + 6, 244, 244);
      g.strokeStyle = 'rgba(120,160,210,.10)'; g.lineWidth = 2; g.strokeRect(x + 7, y + 7, 242, 242);
    } }
    g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = 8;                     /* deep grooves */
    for (i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 1024); g.stroke();
      g.beginPath(); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); }
    /* circuit traces: right-angle runs with pads */
    function trace (pts, col, w) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]);
      for (var k = 2; k < pts.length; k += 2) { g.lineTo(pts[k], pts[k + 1]); } g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(pts[pts.length - 2], pts[pts.length - 1], w * 2.2, 0, TAU); g.fill();
    }
    var seed = 7; function rnd () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (i = 0; i < 46; i++) {
      var sx = Math.floor(rnd() * 16) * 64 + 32, sy = Math.floor(rnd() * 16) * 64 + 32, pts = [sx, sy], px = sx, py = sy;
      for (j = 0; j < 3 + Math.floor(rnd() * 3); j++) {
        if (j % 2) { px += (rnd() < 0.5 ? -1 : 1) * (32 + Math.floor(rnd() * 4) * 32); } else { py += (rnd() < 0.5 ? -1 : 1) * (32 + Math.floor(rnd() * 4) * 32); }
        px = Math.max(20, Math.min(1004, px)); py = Math.max(20, Math.min(1004, py)); pts.push(px, py);
      }
      trace(pts, 'rgba(70,110,160,.30)', 3);
    }
    for (i = 0; i < 9; i++) {                                              /* a few lit traces */
      var ax = Math.floor(rnd() * 16) * 64 + 32, ay = Math.floor(rnd() * 16) * 64 + 32;
      trace([ax, ay, ax + 96, ay, ax + 96, ay + 64], i % 3 ? 'rgba(34,211,238,.55)' : 'rgba(251,146,60,.5)', 2);
    }
    var t = tex(c, true); t.repeat.set(13 / 4, 17 / 4); return t;
  }
  function wallTex () {
    var c = cv(1024, 512), g = c.getContext('2d'), i;
    var gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#0a0f18'); gr.addColorStop(0.5, '#111826'); gr.addColorStop(1, '#090d15');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    for (i = 0; i < 8; i++) {                                              /* panels */
      var x = i * 128;
      g.fillStyle = i % 2 ? '#141c2b' : '#101725'; g.fillRect(x + 8, 40, 112, 300);
      g.strokeStyle = 'rgba(140,170,210,.12)'; g.lineWidth = 2; g.strokeRect(x + 9, 41, 110, 298);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, 0, 8, 512);
      for (var k = 0; k < 6; k++) { g.fillStyle = 'rgba(160,190,230,.08)'; g.fillRect(x + 20, 70 + k * 44, 88, 3); }
      g.fillStyle = i % 3 === 0 ? 'rgba(251,146,60,.85)' : 'rgba(34,211,238,.85)';     /* status LEDs */
      g.fillRect(x + 100, 54, 8, 4); g.fillRect(x + 100, 64, 8, 4);
    }
    g.fillStyle = '#0b1019'; g.fillRect(0, 352, 1024, 160);                /* lower band with vents */
    for (i = 0; i < 64; i++) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(i * 16 + 3, 380, 9, 100); }
    g.fillStyle = 'rgba(34,211,238,.6)'; g.fillRect(0, 348, 1024, 3);
    return tex(c, true);
  }
  function ceilTex () {
    var c = cv(512, 512), g = c.getContext('2d'), i;
    g.fillStyle = '#070b12'; g.fillRect(0, 0, 512, 512);
    for (i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#0d131e' : '#0a0f18'; g.fillRect(0, i * 128 + 8, 512, 112);
      g.strokeStyle = 'rgba(150,180,220,.08)'; g.lineWidth = 2; g.strokeRect(10, i * 128 + 14, 492, 100);
      for (var k = 0; k < 10; k++) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(30 + k * 46, i * 128 + 40, 30, 48); } }
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
  function screenCanvas (w, h) { var c = cv(w, h); return { c: c, g: c.getContext('2d'), t: tex(c) }; }
  function drawGraphScreen (S, now, col, kind) {
    var g = S.g, w = S.c.width, h = S.c.height, i;
    g.fillStyle = '#04101c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(34,211,238,.18)'; g.lineWidth = 1;
    for (i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
    g.fillStyle = col; g.font = '600 ' + Math.round(h * 0.11) + 'px system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText(kind === 0 ? 'TRAFFIC  req/s' : kind === 1 ? 'EDGE HIT RATIO' : 'POWER  kW', 12, h * 0.14);
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath();
    for (i = 0; i <= 40; i++) {
      var x = i / 40 * w, v = 0.5 + 0.28 * Math.sin(i * 0.5 + now / 700 + kind) + 0.12 * Math.sin(i * 1.7 + now / 300);
      var y = h * 0.92 - v * h * 0.65; if (i) { g.lineTo(x, y); } else { g.moveTo(x, y); }
    }
    g.stroke();
    for (i = 0; i < 10; i++) {
      var bh = (0.25 + 0.55 * Math.abs(Math.sin(i * 1.3 + now / 900 + kind))) * h * 0.3;
      g.fillStyle = i % 4 === 0 ? 'rgba(251,146,60,.8)' : 'rgba(34,211,238,.55)'; g.fillRect(w * 0.62 + i * w * 0.035, h * 0.94 - bh, w * 0.022, bh);
    }
    S.t.needsUpdate = true;
  }

  /* ---------- the hall ---------- */
  var shellEl, shell, refl;
  function buildShell () {
    shellEl = document.getElementById('shell'); shell = shellEl.object3D;
    refl = new THREE.Group(); refl.name = 'reflections'; shell.add(refl);
    var B = new Batch(), i, z;
    var wallM = basic({ map: wallTex() }), ceilM = basic({ map: ceilTex() });
    wallM.map.repeat.set(17 / 3.2, 1);
    /* floor: semi-transparent over mirrored glow (the "shiny" floor) */
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, ZF - ZB).rotateX(-Math.PI / 2).translate(0, 0, (ZF + ZB) / 2),
      new THREE.MeshBasicMaterial({ map: floorTex(), transparent: true, opacity: 0.86, toneMapped: false }));
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
    /* neon tubes: centre cyan pair, orange, cyan on the slope, orange low on the slope */
    var TUBES = [[0.55, 'c'], [2.55, 'o'], [4.35, 'c'], [5.8, 'o']];
    var neonC = basic({ color: '#a5f3fc' }), neonO = basic({ color: '#fdba74' });
    var glowC = addMat('#22d3ee', 0.32, STRIPGLOW), glowO = addMat('#fb923c', 0.3, STRIPGLOW);
    TUBES.forEach(function (tb) {
      [-1, 1].forEach(function (s) {
        var x = s * tb[0], y = Math.abs(x) <= XC ? HC - 0.16 : HW + (W - Math.abs(x)) / (W - XC) * (HC - HW) - 0.14;
        var key = tb[1] === 'c' ? 'neonC' : 'neonO';
        B.add(key, tb[1] === 'c' ? neonC : neonO, new THREE.BoxGeometry(0.06, 0.05, ZF - ZB - 0.4), mat4(x, y, (ZF + ZB) / 2));
        B.add(key + 'g', tb[1] === 'c' ? glowC : glowO, new THREE.PlaneGeometry(0.42, ZF - ZB - 0.4), mat4(x, y - 0.03, (ZF + ZB) / 2, Math.PI / 2, 0, 0));
      });
    });
    /* glowing floor line in front of the gates + cyan floor lanes */
    B.add('amber', addMat('#fb923c', 0.9, STRIPGLOW), new THREE.PlaneGeometry(11.4, 0.35), mat4(0, 0.012, -6.85, -Math.PI / 2, 0, 0));
    B.add('amberCore', basic({ color: '#fed7aa' }), new THREE.PlaneGeometry(11.0, 0.03), mat4(0, 0.014, -6.85, -Math.PI / 2, 0, 0));
    [-1, 1].forEach(function (s) {
      B.add('lane', addMat('#22d3ee', 0.35, STRIPGLOW), new THREE.PlaneGeometry(0.22, 14.5), mat4(s * 5.6, 0.011, 0.5, -Math.PI / 2, 0, 0));
    });
    var meshes = B.flush(shell);
    /* reflections of the glowing things, mirrored under the floor */
    ['neonC', 'neonO', 'neonCg', 'neonOg', 'amber'].forEach(function (k) {
      if (!meshes[k]) { return; }
      var m = meshes[k].clone(); m.material = meshes[k].material.clone(); m.material.side = THREE.DoubleSide;
      if (m.material.opacity != null) { m.material.transparent = true; m.material.opacity *= 0.6; }
      m.scale.y = -1; refl.add(m);
    });
    /* title on the back wall */
    var title = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.15), basic({ map: titleTex(), transparent: true, depthWrite: false }));
    title.position.set(0, 4.38, ZB + 0.03); shell.add(title);
    var tglow = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.2), addMat('#22d3ee', 0.16, GLOW)); tglow.position.set(0, 4.4, ZB + 0.02); shell.add(tglow);
    var tr = title.clone(); tr.material = title.material.clone(); tr.material.opacity = 0.18; tr.scale.y = -1; tr.position.y = -4.38; refl.add(tr);
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
      var rimM = basic({ color: G.col });
      var rim = new THREE.Mesh(ringGeo(2.42, 2.97, 0.42, 2.3, 2.85, 0.38, 0.06, 0.06), rimM);
      rim.position.set(0, 0.06, 0.27); holder.add(rim);
      [-1, 1].forEach(function (s) {
        var slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 0.02), rimM); slit.position.set(s * 1.95, 1.65, 0.21); holder.add(slit);
      });
      /* portal surface: rim glow + scrolling energy */
      var pg = new THREE.ShapeGeometry(frameShape(2.3, 2.85, 0.38));
      var base = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: G.col, map: portalTex(G.col), transparent: true, opacity: 0.9,
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
      var core = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.4), addMat(G.col, 0.3, GLOW)); core.position.set(0, 1.55, -0.005); holder.add(core);
      /* floor pad + light spill in front of the gate */
      var pad = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6).rotateX(-Math.PI / 2), addMat(G.glow, 0.45, GLOW));
      pad.position.set(0, 0.02, 1.0); holder.add(pad);
      var spill = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.0), addMat(G.col, 0.22, VFADE)); spill.position.set(0, 1.5, 0.35); holder.add(spill);
      var halo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), addMat(G.col, 0.18, GLOW)); halo.position.set(0, 1.6, 0.02); holder.add(halo);
      /* label plate inside the top of the gate */
      var lab = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.74), basic({ map: gateLabelTex(G), transparent: true, depthWrite: false }));
      lab.position.set(0, 2.42, 0.32); holder.add(lab);
      /* reflection of the glow under the floor */
      var rg = new THREE.Group(); rg.position.set(G.x, 0, GZ); rg.scale.y = -1; refl.add(rg);
      [base, energy, rim].forEach(function (m) { var c = m.clone(); c.material = m.material.clone(); c.material.side = THREE.DoubleSide;
        c.material.transparent = true; c.material.opacity = (c.material.opacity || 1) * 0.45; rg.add(c); });
      FX.portals.push({ energy: energy, base: base, tex: nt, phase: G.n, rings: G.rings });
      /* invisible click target filling the gate (the laser can always hit it) */
      var hit = document.createElement('a-entity');
      hit.setAttribute('geometry', 'primitive: plane; width: 2.4; height: 3.0');
      hit.setAttribute('material', 'visible: false');
      hit.setAttribute('position', (G.x - d.position.x) + ' 1.6 ' + (GZ + 0.35 - d.position.z));
      door.appendChild(hit);
    });
    B.flush(shell);
  }

  /* ---------- screens above/between the gates ---------- */
  function buildScreens () {
    var B = new Batch(), bezelM = std('#1a2230', 0.7, 0.4);
    [[-4.2, 4.3, 1.6, 0.62, 0], [4.2, 4.3, 1.6, 0.62, 1], [-6.05, 2.4, 0.5, 0.9, 1], [6.05, 2.4, 0.5, 0.9, 2]].forEach(function (s, i) {
      var S = screenCanvas(s[2] > 1 ? 512 : 256, s[2] > 1 ? 200 : 400);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(s[2], s[3]), basic({ map: S.t }));
      m.position.set(s[0], s[1], ZB + 0.08); shell.add(m);
      B.add('bezel', bezelM, new THREE.BoxGeometry(s[2] + 0.1, s[3] + 0.1, 0.08), mat4(s[0], s[1], ZB + 0.03));
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(s[2] * 1.8, s[3] * 1.8), addMat('#22d3ee', 0.12, GLOW)); gl.position.set(s[0], s[1], ZB + 0.025); shell.add(gl);
      FX.screens.push({ S: S, kind: s[4], col: s[4] === 1 ? '#2dd4bf' : s[4] === 2 ? '#fb923c' : '#22d3ee' });
    });
    B.flush(shell);
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
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0, 0, 512, 256);
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
    var liquid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, H - 0.12, 40, 1, true),
      addMat('#2dd4bf', 0.42, ct)); liquid.position.y = Y0 + H / 2 - 0.02; T.add(liquid);
    var core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, H - 0.2, 24, 1, true), addMat('#a7f3d0', 0.35, ct));
    core.position.y = Y0 + H / 2; T.add(core);
    var surf = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 40).rotateX(-Math.PI / 2), addMat('#5eead4', 0.5, GLOW));
    surf.position.y = Y0 + H - 0.1; T.add(surf);
    /* heat-exchanger coil (glowing orange: the hot side) */
    var pts = []; for (i = 0; i <= 160; i++) { var u = i / 160, ang = u * 6.5 * TAU;
      pts.push(new V3(Math.cos(ang) * 0.46, Y0 + 0.18 + u * (H - 0.5), Math.sin(ang) * 0.46)); }
    var coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.026, 6, false), basic({ color: '#fdba74' }));
    T.add(coil);
    var coilGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, H - 0.4, 32, 1, true), addMat('#fb923c', 0.12, VFADE));
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
    var pool = new THREE.Mesh(new THREE.CircleGeometry(1.9, 48).rotateX(-Math.PI / 2), addMat('#2dd4bf', 0.38, GLOW)); pool.position.y = 0.02; T.add(pool);
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
    [liquid, core, coil].forEach(function (m) { var c2 = m.clone(); c2.material = m.material.clone(); c2.material.transparent = true;
      c2.material.opacity = (m.material.opacity || 1) * 0.35; c2.material.side = THREE.DoubleSide; rg.add(c2); });
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
      FX.screens.push({ S: S, kind: i ? 2 : 0, col: i ? '#fb923c' : '#22d3ee' });
    });
    /* wall-mounted screens along both walls */
    [[-1, -2.2], [-1, 4.3], [1, -4.6], [1, 1.4]].forEach(function (w, i) {
      var S = screenCanvas(512, 288), x = w[0] * (W - 0.36);
      var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.62), basic({ map: S.t }));
      scr.position.set(x, 2.15, w[1]); scr.rotation.y = -w[0] * Math.PI / 2; shell.add(scr);
      B.add('metal', metal, new THREE.BoxGeometry(0.06, 0.72, 1.2), mat4(x + w[0] * 0.04, 2.15, w[1]));
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), addMat('#22d3ee', 0.1, GLOW));
      gl.position.set(x + w[0] * 0.03, 2.15, w[1]); gl.rotation.y = -w[0] * Math.PI / 2; shell.add(gl);
      FX.screens.push({ S: S, kind: i % 3, col: i % 2 ? '#2dd4bf' : '#22d3ee' });
    });
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
    FX.screens.forEach(function (s) { drawGraphScreen(s.S, performance.now(), s.col, s.kind); });
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
      p.base.material.opacity = 0.72 + 0.12 * Math.sin(now / 700 + p.phase * 2);
      if (p.rings) { p.rings.forEach(function (r, i) {      /* rings pulse inward, one after another */
        r.material.opacity = 0.12 + 0.4 * Math.pow(0.5 + 0.5 * Math.sin(now / 380 - i * 1.1 + p.phase), 2); }); }
    });
    if (now - lastScreen > 220 && FX.screens.length) {            /* one screen per slot: small uploads */
      lastScreen = now; var s = FX.screens[si++ % FX.screens.length]; drawGraphScreen(s.S, now, s.col, s.kind);
    }
    if (window.LOBBY_TICK2) { window.LOBBY_TICK2(t, dt, now); }
  };

  function build () {
    buildShell(); buildGates(); buildScreens();
    FX.screens.forEach(function (s) { drawGraphScreen(s.S, performance.now(), s.col, s.kind); });
    if (window.LOBBY_PROPS) { try { window.LOBBY_PROPS(); } catch (e) { console.error('props', e); } }
    window.LOBBY.built = true;
  }
  var sc = document.querySelector('a-scene');
  if (sc.hasLoaded) { build(); } else { sc.addEventListener('loaded', build); }
})();
