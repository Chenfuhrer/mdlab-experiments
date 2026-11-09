/* =====================================================================
 * instruments.js — 虚拟示波器（双通道，自动量程、上升沿触发）与扫频仪
 * ===================================================================== */
(function (root) {
  "use strict";
  const SEQ = [1, 2, 5];
  function niceStep(x) {                 // ≥ x 的最小 1-2-5 值
    if (!(x > 0)) return 1;
    const e = Math.floor(Math.log10(x));
    for (let k = e - 1; k <= e + 1; k++) for (const m of SEQ) { const v = m * Math.pow(10, k); if (v >= x * 0.9999) return v; }
    return 10 * Math.pow(10, e);
  }
  function fmtV(v) {
    const a = Math.abs(v);
    if (a < 5e-7) return "0 V";
    if (a >= 1) return +v.toFixed(a >= 10 ? 1 : 2) + " V";
    if (a >= 1e-3) return +(v * 1e3).toFixed(a >= 0.01 ? 0 : 1) + " mV";
    return +(v * 1e6).toFixed(0) + " µV";
  }
  function fmtT(t) {
    if (t >= 1) return +t.toPrecision(3) + " s";
    if (t >= 1e-3) return +(t * 1e3).toPrecision(3) + " ms";
    return +(t * 1e6).toPrecision(3) + " µs";
  }
  const COL = { ch1: "#f5c400", ch2: "#3fd0e0" };

  class Scope {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d");
      this.coupling = { ch1: "AC", ch2: "AC" };
      this.vdivFix = { ch1: null, ch2: null };
      this.on = { ch1: true, ch2: true };
      this.resize();
      root.addEventListener && root.addEventListener("resize", () => this.resize());
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = root.devicePixelRatio || 1;
      this.W = Math.max(200, r.width); this.H = Math.max(160, r.height);
      this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.last) this.draw(this.last);
    }
    /** frame: {t, ch1, ch2, T(周期), tdiv?}；返回本次使用的量程 */
    draw(frame) {
      this.last = frame;
      const { ctx, W, H } = this;
      const gx = 10, gy = 8;
      const padT = 22, padB = 22;
      const sh = H - padT - padB, sw = W;
      const dx = sw / gx, dy = sh / gy;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#081110"; ctx.fillRect(0, 0, W, H);
      const grd = ctx.createRadialGradient(W / 2, padT + sh / 2, 10, W / 2, padT + sh / 2, W * 0.7);
      grd.addColorStop(0, "rgba(60,120,100,0.10)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd; ctx.fillRect(0, padT, W, sh);
      // 刻度
      ctx.strokeStyle = "rgba(140,200,175,0.16)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= gx; i++) { const x = Math.round(i * dx) + 0.5; ctx.moveTo(x, padT); ctx.lineTo(x, padT + sh); }
      for (let j = 0; j <= gy; j++) { const y = Math.round(padT + j * dy) + 0.5; ctx.moveTo(0, y); ctx.lineTo(sw, y); }
      ctx.stroke();
      ctx.strokeStyle = "rgba(140,200,175,0.32)";
      ctx.beginPath();
      const cx = Math.round(sw / 2) + 0.5, cy = Math.round(padT + sh / 2) + 0.5;
      ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + sh); ctx.moveTo(0, cy); ctx.lineTo(sw, cy);
      for (let i = 0; i <= gx * 5; i++) { const x = i * dx / 5; ctx.moveTo(x, cy - 3); ctx.lineTo(x, cy + 3); }
      for (let j = 0; j <= gy * 5; j++) { const y = padT + j * dy / 5; ctx.moveTo(cx - 3, y); ctx.lineTo(cx + 3, y); }
      ctx.stroke();

      const out = {};
      if (!frame || !frame.t || frame.t.length < 4) { this.bars(ctx, W, H, padT, sh, {}); return out; }
      const { t } = frame;
      const n = t.length, dt = t[1] - t[0];
      const tdiv = frame.tdiv || niceStep(2.5 * frame.T / gx);
      const span = tdiv * gx;
      const nspan = Math.min(n, Math.round(span / dt));
      // 触发：CH1（或 CH2）上升沿过中值
      const trigSrc = this.on.ch1 && frame.ch1 ? frame.ch1 : frame.ch2;
      let start = Math.max(0, n - nspan);
      let trig = false;
      if (trigSrc) {
        let mx = -Infinity, mn = Infinity; for (let i = 0; i < n; i++) { const v = trigSrc[i]; if (v > mx) mx = v; if (v < mn) mn = v; }
        const lvl = (mx + mn) / 2;
        if (mx - mn > 1e-6) {
          const latest = n - nspan;
          for (let i = latest; i > 0; i--) if (trigSrc[i - 1] < lvl && trigSrc[i] >= lvl) { start = i; trig = true; break; }
          out.trigLevel = lvl;
        }
      }
      const scales = {};
      for (const ch of ["ch1", "ch2"]) {
        const y = frame[ch];
        if (!y || !this.on[ch]) continue;
        let mx = -Infinity, mn = Infinity, sum = 0;
        for (let i = 0; i < n; i++) { const v = y[i]; if (v > mx) mx = v; if (v < mn) mn = v; sum += v; }
        const mean = sum / n;
        const off = this.coupling[ch] === "AC" ? mean : 0;
        const ext = Math.max(Math.abs(mx - off), Math.abs(mn - off), 1e-6);
        const vdiv = this.vdivFix[ch] || niceStep(ext / 3.6);
        scales[ch] = { vdiv, off };
        ctx.save();
        ctx.beginPath(); ctx.rect(0, padT, sw, sh); ctx.clip();
        ctx.strokeStyle = COL[ch]; ctx.lineWidth = 1.7; ctx.lineJoin = "round";
        ctx.shadowColor = COL[ch]; ctx.shadowBlur = 7;
        ctx.beginPath();
        const m = Math.min(nspan, n - start);
        const stepPx = Math.max(1, Math.floor(m / (sw * 2)));
        for (let k = 0; k < m; k += stepPx) {
          const i = start + k;
          const X = (k * dt) / span * sw;
          const Y = padT + sh / 2 - (y[i] - off) / vdiv * dy;
          if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.restore();
        // 通道零电平标记
        const y0 = padT + sh / 2 + off / vdiv * dy * (this.coupling[ch] === "AC" ? 0 : 1);
        const yy = Math.min(padT + sh - 8, Math.max(padT + 8, this.coupling[ch] === "AC" ? padT + sh / 2 : padT + sh / 2));
        ctx.fillStyle = COL[ch];
        ctx.beginPath(); const ty = ch === "ch1" ? yy - 9 : yy + 9;
        ctx.moveTo(0, ty - 6); ctx.lineTo(9, ty); ctx.lineTo(0, ty + 6); ctx.fill();
        ctx.font = "600 10px 'IBM Plex Mono', monospace"; ctx.fillStyle = "#081110"; ctx.fillText(ch === "ch1" ? "1" : "2", 1, ty + 3.5);
      }
      out.scales = scales; out.tdiv = tdiv; out.trig = trig;
      this.bars(ctx, W, H, padT, sh, { scales, tdiv, trig });
      return out;
    }
    bars(ctx, W, H, padT, sh, info) {
      ctx.fillStyle = "#0d1715"; ctx.fillRect(0, 0, W, padT); ctx.fillRect(0, padT + sh, W, H - padT - sh);
      ctx.font = "500 11px 'IBM Plex Mono', monospace"; ctx.textBaseline = "middle";
      let x = 8;
      const put = (txt, col) => { ctx.fillStyle = col; ctx.fillText(txt, x, padT / 2 + 1); x += ctx.measureText(txt).width + 14; };
      if (info.scales) {
        for (const ch of ["ch1", "ch2"]) if (info.scales[ch]) put(`${ch === "ch1" ? "1" : "2"}  ${fmtV(info.scales[ch].vdiv)}/div ${this.coupling[ch]}`, COL[ch]);
      }
      ctx.fillStyle = "#9fb8ae";
      const tb = info.tdiv ? `${fmtT(info.tdiv)}/div` : "";
      ctx.textAlign = "right"; ctx.fillText(tb, W - 8, padT / 2 + 1); ctx.textAlign = "left";
      ctx.fillText(info.trig ? "Trig ↑ 已触发" : (info.scales ? "Trig ↑ 等待" : "无信号"), 8, padT + sh + (H - padT - sh) / 2);
    }
  }

  /** 扫频仪：对数频率轴的幅频曲线 */
  class Bode {
    constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext("2d"); this.resize(); root.addEventListener && root.addEventListener("resize", () => this.resize()); }
    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
      this.W = Math.max(200, r.width); this.H = Math.max(120, r.height);
      this.cv.width = this.W * dpr; this.cv.height = this.H * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.last) this.draw(this.last);
    }
    /** d: {pts:[{f,mag}], fmin, fmax, marker f, fc, lvl, db:boolean, unit} */
    draw(d) {
      this.last = d;
      const { ctx, W, H } = this;
      const L = 44, Rr = 12, Tt = 12, B = 26;
      const pw = W - L - Rr, ph = H - Tt - B;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#081110"; ctx.fillRect(0, 0, W, H);
      const lf0 = Math.log10(d.fmin), lf1 = Math.log10(d.fmax);
      const val = (p) => (d.db ? 20 * Math.log10(Math.max(p.mag, 1e-9)) : p.mag);
      const vals = d.pts.map(val);
      let ymax = Math.max(...vals), ymin = 0;
      if (!d.db) ymax = niceStep(ymax / 4) * 4.2;
      else { ymax = Math.ceil((ymax + 3) / 10) * 10; ymin = ymax - 60; }
      const X = (f) => L + (Math.log10(f) - lf0) / (lf1 - lf0) * pw;
      const Y = (v) => Tt + (1 - (v - ymin) / (ymax - ymin)) * ph;
      ctx.strokeStyle = "rgba(140,200,175,0.14)"; ctx.lineWidth = 1; ctx.beginPath();
      ctx.font = "10px 'IBM Plex Mono', monospace"; ctx.fillStyle = "#7f978d"; ctx.textAlign = "center";
      for (let e = Math.ceil(lf0); e <= Math.floor(lf1); e++) {
        for (let m = 1; m < 10; m++) { const f = m * Math.pow(10, e); if (f < d.fmin || f > d.fmax) continue; const x = Math.round(X(f)) + 0.5; ctx.moveTo(x, Tt); ctx.lineTo(x, Tt + ph); }
        const fv = Math.pow(10, e);
        const lab = fv >= 1e6 ? fv / 1e6 + "M" : fv >= 1e3 ? fv / 1e3 + "k" : String(fv);
        const xl = X(fv);
        ctx.textAlign = xl > W - 20 ? "right" : xl < L + 8 ? "left" : "center";
        ctx.fillText(lab, Math.min(xl, W - 4), H - 9);
      }
      ctx.textAlign = "right";
      const ystep = d.db ? 10 : niceStep((ymax - ymin) / 5);
      ctx.textAlign = "right";
      for (let v = ymin; v <= ymax + 1e-9; v += ystep) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.fillText(d.db ? v.toFixed(0) : +v.toFixed(2) + "", L - 6, y + 3); }
      ctx.stroke();
      ctx.save(); ctx.translate(11, Tt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText(d.unit || (d.db ? "|Au| dB" : "Uo / V"), 0, 0); ctx.restore();
      if (d.lvl) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.setLineDash([4, 4]); ctx.beginPath();
        const yl = Y(d.db ? 20 * Math.log10(d.lvl) : d.lvl); ctx.moveTo(L, yl); ctx.lineTo(L + pw, yl); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(L, Tt, pw, ph); ctx.clip();
      ctx.strokeStyle = COL.ch2; ctx.lineWidth = 1.8; ctx.shadowColor = COL.ch2; ctx.shadowBlur = 6; ctx.beginPath();
      d.pts.forEach((p, i) => { const x = X(p.f), y = Y(vals[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      if (d.fc && isFinite(d.fc)) {
        ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(d.fc), Tt); ctx.lineTo(X(d.fc), Tt + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#e9efe9"; ctx.textAlign = X(d.fc) > L + pw - 90 ? "right" : "left";
        ctx.fillText(`${d.fcLabel || "fc"} = ${d.fc >= 1000 ? (d.fc / 1000).toFixed(3) + " kHz" : d.fc.toFixed(1) + " Hz"}`, X(d.fc) + (ctx.textAlign === "left" ? 5 : -5), Tt + 12);
      }
      if (d.marker) {
        const x = X(d.marker);
        ctx.strokeStyle = COL.ch1; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, Tt); ctx.lineTo(x, Tt + ph); ctx.stroke();
        let mv = null; for (let i = 1; i < d.pts.length; i++) if (d.pts[i].f >= d.marker) { const a = d.pts[i - 1], b = d.pts[i]; const r = (Math.log(d.marker) - Math.log(a.f)) / (Math.log(b.f) - Math.log(a.f)); mv = vals[i - 1] + r * (vals[i] - vals[i - 1]); break; }
        if (mv !== null) { ctx.fillStyle = COL.ch1; ctx.beginPath(); ctx.arc(x, Y(mv), 4, 0, 7); ctx.fill(); }
      }
    }
  }

  root.Instruments = { Scope, Bode, niceStep, fmtV, fmtT, COL };
})(typeof window !== "undefined" ? window : globalThis);
