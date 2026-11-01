/* ===========================================================
   GLOBE — 无依赖的 WebGL 点阵地球
   · 40k 陆地点云（assets/world-dots.js）+ 经纬网
   · 拖拽旋转 / 滚轮缩放 / 惯性 / 自动巡航 / 飞向指定坐标
   · 2D overlay 绘制标记、脉冲、标签、悬停
   =========================================================== */
(function () {
  "use strict";

  const D2R = Math.PI / 180;

  /* ---------------- 数据解码 ---------------- */
  function decodeDots() {
    const b64 = window.WORLD_DOTS;
    if (!b64) return null;
    const bin = atob(b64);
    const n = bin.length / 4;
    const buf = new ArrayBuffer(bin.length);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(buf);
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lon = i16[i * 2] / 100 * D2R;
      const lat = i16[i * 2 + 1] / 100 * D2R;
      const cl = Math.cos(lat);
      pos[i * 3] = cl * Math.sin(lon);
      pos[i * 3 + 1] = Math.sin(lat);
      pos[i * 3 + 2] = cl * Math.cos(lon);
      // 稳定的伪随机亮度，避免每帧闪烁
      rnd[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    }
    return { pos, rnd, count: n };
  }

  function buildGraticule() {
    const pos = [], rnd = [];
    const push = (lon, lat) => {
      const cl = Math.cos(lat * D2R);
      pos.push(cl * Math.sin(lon * D2R), Math.sin(lat * D2R), cl * Math.cos(lon * D2R));
      rnd.push(1);
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = 0; lon < 360; lon += 2) push(lon, lat);
    }
    for (let lon = 0; lon < 360; lon += 30) {
      for (let lat = -90; lat <= 90; lat += 2) push(lon, lat);
    }
    return { pos: new Float32Array(pos), rnd: new Float32Array(rnd), count: rnd.length };
  }

  /* ---------------- 着色器 ---------------- */
  const DISC_VS = `
    attribute vec2 aPos;
    varying vec2 vP;
    void main(){ vP = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const DISC_FS = `
    precision mediump float;
    uniform vec2 uRes;
    uniform vec2 uCenter;
    uniform float uR;
    void main(){
      float r = length(gl_FragCoord.xy - uCenter) / uR;
      if (r > 1.09) discard;
      float inside = 1.0 - smoothstep(0.997, 1.0, r);
      float shade  = pow(clamp(1.0 - r * r, 0.0, 1.0), 0.55);
      vec3 deep = vec3(0.010, 0.038, 0.032);
      vec3 mid  = vec3(0.028, 0.098, 0.082);
      vec3 col = mix(deep, mid, shade);
      float rim = smoothstep(0.82, 1.0, r) * inside;
      col += vec3(0.09, 0.42, 0.33) * rim * 0.55;
      float halo = smoothstep(1.09, 0.995, r) * (1.0 - inside);
      vec3 haloC = vec3(0.20, 0.85, 0.66) * halo * 0.22;
      float a = inside * 1.0 + halo * 0.5;
      gl_FragColor = vec4(col + haloC, a);
    }`;

  const PT_VS = `
    attribute vec3 aPos;
    attribute float aRand;
    uniform mat3 uRot;
    uniform vec2 uRes;
    uniform vec2 uCenter;
    uniform float uR;
    uniform float uSize;
    uniform float uDpr;
    varying float vA;
    varying float vK;
    void main(){
      vec3 p = uRot * aPos;
      float z = p.z;
      float vis = smoothstep(-0.06, 0.22, z);
      vec2 px = uCenter + vec2(p.x, -p.y) * uR;
      vec2 ndc = (px / uRes) * 2.0 - 1.0;
      gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
      gl_PointSize = max(1.0, uSize * uDpr * (0.72 + 0.42 * z) * vis);
      vA = vis * (0.35 + 0.65 * smoothstep(0.0, 0.55, z));
      vK = aRand;
    }`;

  const PT_FS = `
    precision mediump float;
    uniform vec3 uColor;
    uniform float uAlpha;
    varying float vA;
    varying float vK;
    void main(){
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.12, d) * vA * uAlpha;
      vec3 c = uColor * (0.60 + 0.55 * vK);
      gl_FragColor = vec4(c, a);
    }`;

  /* ---------------- 工具 ---------------- */
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s), src);
      return null;
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const LEVEL_COLOR = { S: "#ff4a5e", A: "#ffcf6b", B: "#6fe3ff", C: "#7dffcd" };

  /* ---------------- 主体 ---------------- */
  class Globe {
    constructor(canvas, overlay, opts) {
      this.canvas = canvas;
      this.overlay = overlay;
      this.ctx2 = overlay.getContext("2d");
      this.opts = opts || {};
      this.sites = [];
      this.yaw = -113 * Math.PI / 180;   // 初始朝向中国
      this.pitch = 0.42;
      this.zoom = 1;
      this.targetZoom = 1;
      this.velYaw = 0;
      this.velPitch = 0;
      this.dragging = false;
      this.hover = null;
      this.selected = null;
      this.lastInteract = 0;
      this.fly = null;
      this.visible = true;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._init();
    }

    _init() {
      const gl = this.canvas.getContext("webgl", {
        alpha: true, antialias: true, premultipliedAlpha: false, depth: false
      });
      this.gl = gl;
      this.dots = decodeDots();
      this.grat = buildGraticule();

      if (gl) {
        this.disc = program(gl, DISC_VS, DISC_FS);
        this.pt = program(gl, PT_VS, PT_FS);
        if (!this.disc || !this.pt) { this.gl = null; }
      }
      if (this.gl) this._glSetup(); else console.warn("WebGL 不可用，使用 2D 退化渲染");

      this._bindInput();
      this._bindResize();
      this._loop = this._frame.bind(this);
      requestAnimationFrame(this._loop);
    }

    _glSetup() {
      const gl = this.gl;
      this.discBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.1, -1.1, 1.1, -1.1, -1.1, 1.1, 1.1, 1.1]), gl.STATIC_DRAW);

      const mk = (d) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, d.pos, gl.STATIC_DRAW);
        const r = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, r);
        gl.bufferData(gl.ARRAY_BUFFER, d.rnd, gl.STATIC_DRAW);
        return { pos: b, rnd: r, count: d.count };
      };
      this.dotBuf = this.dots ? mk(this.dots) : null;
      this.gratBuf = mk(this.grat);

      this.u = {
        rot: gl.getUniformLocation(this.pt, "uRot"),
        res: gl.getUniformLocation(this.pt, "uRes"),
        center: gl.getUniformLocation(this.pt, "uCenter"),
        R: gl.getUniformLocation(this.pt, "uR"),
        size: gl.getUniformLocation(this.pt, "uSize"),
        dpr: gl.getUniformLocation(this.pt, "uDpr"),
        color: gl.getUniformLocation(this.pt, "uColor"),
        alpha: gl.getUniformLocation(this.pt, "uAlpha")
      };
      this.du = {
        res: gl.getUniformLocation(this.disc, "uRes"),
        center: gl.getUniformLocation(this.disc, "uCenter"),
        R: gl.getUniformLocation(this.disc, "uR")
      };
      this.aPos = gl.getAttribLocation(this.pt, "aPos");
      this.aRnd = gl.getAttribLocation(this.pt, "aRand");
      this.dPos = gl.getAttribLocation(this.disc, "aPos");

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
    }

    setSites(list) { this.sites = list || []; }

    _bindResize() {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.canvas.parentElement || this.canvas);
      this.resize();
    }

    resize() {
      const host = this.canvas.parentElement;
      const rect = (host || this.canvas).getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(320, Math.round(rect.height));
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [this.canvas, this.overlay]) {
        c.width = Math.round(w * this.dpr);
        c.height = Math.round(h * this.dpr);
        c.style.width = w + "px";
        c.style.height = h + "px";
      }
      this.w = w; this.h = h;
      this.cx = w / 2; this.cy = h / 2;
      this.baseR = Math.min(w, h) * 0.405;
      if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this._buildGlowSprites();
    }

    _buildGlowSprites() {
      this.sprites = {};
      for (const k in LEVEL_COLOR) {
        const s = 96;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const g = c.getContext("2d");
        const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        grad.addColorStop(0, LEVEL_COLOR[k] + "cc");
        grad.addColorStop(0.35, LEVEL_COLOR[k] + "44");
        grad.addColorStop(1, LEVEL_COLOR[k] + "00");
        g.fillStyle = grad;
        g.fillRect(0, 0, s, s);
        this.sprites[k] = c;
      }
    }

    /* ---------------- 输入 ---------------- */
    _bindInput() {
      const el = this.overlay;
      let last = null, downPos = null, moved = 0;

      el.addEventListener("pointerdown", e => {
        el.setPointerCapture(e.pointerId);
        this.dragging = true; last = { x: e.clientX, y: e.clientY };
        downPos = { x: e.clientX, y: e.clientY }; moved = 0;
        this.velYaw = this.velPitch = 0;
        this.fly = null;
        this.lastInteract = performance.now();
      });

      el.addEventListener("pointermove", e => {
        const r = this.baseR * this.zoom;
        if (this.dragging && last) {
          const dx = e.clientX - last.x, dy = e.clientY - last.y;
          moved += Math.abs(dx) + Math.abs(dy);
          const k = 1 / r;
          this.yaw += dx * k * 0.9;
          this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * k * 0.9));
          this.velYaw = dx * k * 0.9;
          this.velPitch = -dy * k * 0.9;
          last = { x: e.clientX, y: e.clientY };
          this.lastInteract = performance.now();
        } else {
          this.hover = this._pick(e.clientX, e.clientY);
          el.style.cursor = this.hover ? "pointer" : "grab";
        }
      });

      const end = (e) => {
        if (!this.dragging) return;
        this.dragging = false; last = null;
        this.lastInteract = performance.now();
        if (moved < 6 && downPos) {
          const hit = this._pick(e.clientX, e.clientY);
          if (hit) { this.select(hit); }
        }
        downPos = null;
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("pointerleave", () => { this.hover = null; });

      el.addEventListener("wheel", e => {
        e.preventDefault();
        const f = Math.exp(-e.deltaY * 0.0013);
        this.zoom = Math.max(1, Math.min(5.2, this.zoom * f));
        this.lastInteract = performance.now();
        this.onZoom && this.onZoom(this.zoom);
      }, { passive: false });

      el.addEventListener("dblclick", () => this.reset());

      // 键盘：方向键旋转、+/- 缩放、0 复位
      window.addEventListener("keydown", e => {
        if (!this.visible) return;
        const tag = (document.activeElement || {}).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const step = 0.055;
        switch (e.key) {
          case "ArrowLeft": this.yaw -= step; break;
          case "ArrowRight": this.yaw += step; break;
          case "ArrowUp": this.pitch = Math.min(1.5, this.pitch + step); break;
          case "ArrowDown": this.pitch = Math.max(-1.5, this.pitch - step); break;
          case "+": case "=": this.zoomBy(1.15); break;
          case "-": case "_": this.zoomBy(1 / 1.15); break;
          case "0": this.reset(); break;
          default: return;
        }
        this.lastInteract = performance.now();
        e.preventDefault();
      });
    }

    reset() {
      this.flyTo(null, null, 1);
    }

    zoomBy(f) {
      this.zoom = Math.max(1, Math.min(5.2, this.zoom * f));
      this.onZoom && this.onZoom(this.zoom);
    }

    /* 平滑飞向某经纬度（degrees） */
    flyTo(lng, lat, zoom) {
      if (lng == null) {
        this.fly = { y0: this.yaw, p0: this.pitch, z0: this.zoom, y1: -113 * Math.PI / 180, p1: 0.42, z1: 1, t: 0, dur: 800 };
      } else {
        let y1 = -lng * D2R;
        // 选最近的等价角度，避免绕远路
        while (y1 - this.yaw > Math.PI) y1 -= Math.PI * 2;
        while (y1 - this.yaw < -Math.PI) y1 += Math.PI * 2;
        this.fly = {
          y0: this.yaw, p0: this.pitch, z0: this.zoom,
          y1, p1: Math.max(-1.5, Math.min(1.5, lat * D2R)), z1: zoom || Math.max(1.7, this.zoom),
          t: 0, dur: 900
        };
      }
      this.lastInteract = performance.now();
    }

    select(site) {
      this.selected = site;
      this.opts.onSelect && this.opts.onSelect(site);
    }

    /* ---------------- 投影 ---------------- */
    _unit(lng, lat) {
      const cl = Math.cos(lat * D2R);
      return [cl * Math.sin(lng * D2R), Math.sin(lat * D2R), cl * Math.cos(lng * D2R)];
    }

    _project(site) {
      const [x, y, z] = this._unit(site.lng, site.lat);
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x1 = x * cy + z * sy;
      const z1 = z * cy - x * sy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      const R = this.baseR * this.zoom;
      return { x: this.cx + x1 * R, y: this.cy - y2 * R, z: z2 };
    }

    _pick(clientX, clientY) {
      const rect = this.overlay.getBoundingClientRect();
      const mx = clientX - rect.left, my = clientY - rect.top;
      let best = null, bestD = 16;
      for (const s of this.sites) {
        const p = this._project(s);
        if (p.z < 0.08) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) { bestD = d; best = s; }
      }
      return best;
    }

    /* ---------------- 渲染 ---------------- */
    _frame(now) {
      requestAnimationFrame(this._loop);
      if (!this.visible) return;

      const dt = Math.min(50, now - (this._t || now)) / 16.67;
      this._t = now;

      // 飞行动画
      if (this.fly) {
        const f = this.fly;
        f.t += dt * 16.67;
        const k = easeInOut(Math.min(1, f.t / f.dur));
        this.yaw = f.y0 + (f.y1 - f.y0) * k;
        this.pitch = f.p0 + (f.p1 - f.p0) * k;
        this.zoom = f.z0 + (f.z1 - f.z0) * k;
        this.onZoom && this.onZoom(this.zoom);
        if (k >= 1) this.fly = null;
      } else if (!this.dragging) {
        // 惯性
        if (Math.abs(this.velYaw) > 1e-5 || Math.abs(this.velPitch) > 1e-5) {
          this.yaw += this.velYaw * dt;
          this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + this.velPitch * dt));
          this.velYaw *= Math.pow(0.93, dt);
          this.velPitch *= Math.pow(0.93, dt);
        } else if (now - this.lastInteract > 4200 && this.opts.autoRotate !== false) {
          this.yaw += 0.00016 * dt;   // 自动巡航
        }
      }

      this._drawGL();
      this._drawOverlay(now);
    }

    _drawGL() {
      const gl = this.gl;
      if (!gl) { return; }
      const W = this.canvas.width, H = this.canvas.height;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const R = this.baseR * this.zoom * this.dpr;
      const cx = this.cx * this.dpr, cy = this.cy * this.dpr;

      // --- 球体
      gl.useProgram(this.disc);
      gl.uniform2f(this.du.res, W, H);
      gl.uniform2f(this.du.center, cx, H - cy);
      gl.uniform1f(this.du.R, R);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuf);
      gl.enableVertexAttribArray(this.dPos);
      gl.vertexAttribPointer(this.dPos, 2, gl.FLOAT, false, 0, 0);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // --- 点云
      const cyA = Math.cos(this.yaw), syA = Math.sin(this.yaw);
      const cpA = Math.cos(this.pitch), spA = Math.sin(this.pitch);
      const m = new Float32Array([
        cyA, syA * spA, -syA * cpA,      // 列 0
        0, cpA, spA,                     // 列 1
        syA, -cyA * spA, cyA * cpA       // 列 2
      ]);

      gl.useProgram(this.pt);
      gl.uniformMatrix3fv(this.u.rot, false, m);
      gl.uniform2f(this.u.res, W, H);
      gl.uniform2f(this.u.center, cx, cy);
      gl.uniform1f(this.u.R, R);
      gl.uniform1f(this.u.dpr, this.dpr);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      const drawSet = (buf, color, size, alpha) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.pos);
        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.rnd);
        gl.enableVertexAttribArray(this.aRnd);
        gl.vertexAttribPointer(this.aRnd, 1, gl.FLOAT, false, 0, 0);
        gl.uniform3fv(this.u.color, color);
        gl.uniform1f(this.u.size, size);
        gl.uniform1f(this.u.alpha, alpha);
        gl.drawArrays(gl.POINTS, 0, buf.count);
      };

      // 经纬网
      drawSet(this.gratBuf, [0.36, 0.95, 0.78], 1.0, 0.10);
      // 陆地
      if (this.dotBuf) {
        const s = 1.62 * (0.92 + 0.10 * this.zoom);
        drawSet(this.dotBuf, [0.49, 1.0, 0.80], s, 0.95);
      }
    }

    _drawOverlay(now) {
      const g = this.ctx2;
      const dpr = this.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);

      const zoom = this.zoom;
      const labels = [];
      const shown = [];

      // 按深度排序，远的先画
      const list = this.sites
        .map(s => ({ s, p: this._project(s) }))
        .filter(o => o.p.z > 0.06)
        .sort((a, b) => a.p.z - b.p.z);

      for (const { s, p } of list) {
        const col = LEVEL_COLOR[s.lv] || "#7dffcd";
        const isHover = this.hover === s;
        const isSel = this.selected === s;
        const r = s.lv === "S" ? 4.4 : s.lv === "A" ? 3.4 : s.lv === "B" ? 2.8 : 2.2;

        // 脉冲
        if (s.lv === "S" || s.lv === "A") {
          const t = ((now / 1000) + (s.lng + s.lat) * 0.13) % 2.4;
          const k = t / 2.4;
          g.beginPath();
          g.arc(p.x, p.y, r + k * 26, 0, Math.PI * 2);
          g.strokeStyle = col;
          g.globalAlpha = (1 - k) * 0.55 * p.z;
          g.lineWidth = 1;
          g.stroke();
          g.globalAlpha = 1;
        }

        // 光晕
        const spr = this.sprites[s.lv];
        const gs = (isHover || isSel ? 40 : 24) * (0.65 + 0.5 * p.z);
        g.globalAlpha = 0.9 * Math.max(0.25, p.z);
        g.drawImage(spr, p.x - gs / 2, p.y - gs / 2, gs, gs);
        g.globalAlpha = 1;

        // 核心
        g.beginPath();
        g.arc(p.x, p.y, r * (isHover || isSel ? 1.35 : 1), 0, Math.PI * 2);
        g.fillStyle = col;
        g.shadowColor = col;
        g.shadowBlur = 12;
        g.fill();
        g.shadowBlur = 0;

        // 选中环
        if (isSel) {
          const rr = r + 8 + Math.sin(now / 260) * 2;
          g.beginPath();
          g.arc(p.x, p.y, rr, 0, Math.PI * 2);
          g.strokeStyle = "#eafff8";
          g.lineWidth = 1.2;
          g.stroke();
          g.beginPath();
          g.moveTo(p.x - rr - 6, p.y); g.lineTo(p.x - rr - 1, p.y);
          g.moveTo(p.x + rr + 1, p.y); g.lineTo(p.x + rr + 6, p.y);
          g.moveTo(p.x, p.y - rr - 6); g.lineTo(p.x, p.y - rr - 1);
          g.moveTo(p.x, p.y + rr + 1); g.lineTo(p.x, p.y + rr + 6);
          g.strokeStyle = "#eafff8";
          g.stroke();
        }

        // 标签
        const hot = isHover || isSel;
        const wantLabel = hot || (s.lv === "S" && p.z > 0.45) || (s.lv === "A" && zoom >= 1.9);
        if (wantLabel) {
          labels.push({ s, p, col, hot, pri: (hot ? 100 : (s.lv === "S" ? 40 : 30)) + p.z * 10 });
        }
        shown.push({ s, p });
      }

      // 标签避让
      const taken = [];
      labels.sort((a, b) => b.pri - a.pri);
      let placed = 0;
      for (const L of labels) {
        if (placed >= 12) break;
        const txt = L.s.n;
        g.font = "11px 'Microsoft YaHei UI', 'PingFang SC', sans-serif";
        const w = g.measureText(txt).width;
        const x = L.p.x + 9, y = L.p.y - 9;
        const box = [x - 3, y - 12, w + 8, 17];
        if (taken.some(b => !(box[0] > b[0] + b[2] || box[0] + box[2] < b[0] ||
                              box[1] > b[1] + b[3] || box[1] + box[3] < b[1]))) continue;
        taken.push(box); placed++;

        g.font = "11px 'Microsoft YaHei UI', 'PingFang SC', sans-serif";
        g.textBaseline = "alphabetic";
        g.fillStyle = "rgba(2,14,11,.72)";
        g.fillRect(box[0], box[1], box[2], box[3]);
        if (L.hot) { g.strokeStyle = L.col; g.strokeRect(box[0] + .5, box[1] + .5, box[2] - 1, box[3] - 1); }
        g.fillStyle = L.hot ? "#ffffff" : "rgba(206,250,236,.90)";
        g.fillText(txt, x, y);
      }
    }
  }

  window.Globe = Globe;
})();
