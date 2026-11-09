/* =====================================================================
 * lab.js — 实验页控制器：实时仿真 + 仪器 + 数据表 + 讲解
 * ===================================================================== */
(function () {
  "use strict";
  const { Solver, measureTone, phaseDiff } = window.AnalogSim;
  const Cc = window.Circuits;
  const { Scope, Bode, fmtV } = window.Instruments;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getK = (o, k) => k.split(".").reduce((a, b) => (a == null ? a : a[b]), o);
  const setK = (o, k, v) => { const ks = k.split("."); let a = o; ks.slice(0, -1).forEach((x) => (a = a[x] = a[x] || {})); a[ks[ks.length - 1]] = v; };
  const deepMerge = (a, b) => { const r = clone(a); for (const [k, v] of Object.entries(b || {})) r[k] = v && typeof v === "object" && !Array.isArray(v) && r[k] && typeof r[k] === "object" ? deepMerge(r[k], v) : v; return r; };

  function si(v, unit, digits = 3) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a < 1e-12) return `0 ${unit}`;
    const P = [[1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"]];
    for (const [s, p] of P) if (a >= s * 0.9995 || s === 1e-9) { const x = v / s; return `${+x.toPrecision(digits)} ${p}${unit}`; }
    return `${v} ${unit}`;
  }

  const id = new URLSearchParams(location.search).get("e") || "1";
  const EXP = window.EXP[id] || window.EXP["1"];
  const TXT = window.CONTENT[id] || {};
  document.title = `实验 ${EXP.no} ${EXP.title.replace(/<[^>]+>/g, "")} · 模电虚拟实验室`;

  // ------------------------------------------------------------ 页头与导航
  $("#expnav").innerHTML = window.EXP_ORDER.map((k) => {
    const e = window.EXP[k];
    return `<a href="lab.html?e=${k}" class="${k === id ? "cur" : ""}" ${k === id ? 'aria-current="page"' : ""}><b>${e.no}</b><span>${e.title.replace("集成运放的应用——", "")}</span></a>`;
  }).join("");
  $("#exp-no").textContent = `实验 ${EXP.no}`;
  $("#exp-title").innerHTML = EXP.title;
  $("#exp-lead").textContent = EXP.lead;

  // ------------------------------------------------------------ 标签页
  function showTab(name) {
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    $$(".pane").forEach((p) => (p.hidden = p.id !== "pane-" + name));
    if (name === "bench") { scope.resize(); bode && bode.resize(); }
    if (name === "theory") renderMath($("#pane-theory"));
    if (name === "qa") renderMath($("#pane-qa"));
    history.replaceState(null, "", `?e=${id}#${name}`);
  }
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  // ================================================================ 实验台
  const state = { p: clone(EXP.defaults), probes: Object.assign({}, EXP.probes), role: "ch1", running: true, dmmMode: "DC" };
  const live = {};
  const scope = new Scope($("#scope"));
  const bode = EXP.bode ? new Bode($("#bode")) : null;
  if (!bode) $("#bode-card").remove();

  function kindOf(p) { return p.circuit; }
  function paramsFor(p) {
    const q = clone(p);
    if (q.src && q.src.type === "square" && (q.circuit === "integrator" || q.circuit === "differentiator")) q.src.delay = 0.25 / q.src.f;
    return q;
  }

  // ---- 控件
  function fmtCtl(c, v) {
    if (c.unit === "Ω") return si(v, "Ω", 3);
    if (c.unit === "Hz") return si(v, "Hz", 3);
    if (c.unit === "V") return v === 0 ? "0 mV" : +(v * 1e3).toFixed(2) + " mV";
    if (c.unit === "Vpp") return si(v, "Vpp", 3);
    return String(v);
  }
  function sliderToVal(c, s) { if (c.log) { const a = Math.log10(Math.max(c.min, 1e-9)), b = Math.log10(c.max); return Math.pow(10, a + (b - a) * s / 1000); } return c.min + (c.max - c.min) * s / 1000; }
  function valToSlider(c, v) { if (c.log) { const a = Math.log10(Math.max(c.min, 1e-9)), b = Math.log10(c.max); return 1000 * (Math.log10(Math.max(v, c.min)) - a) / (b - a); } return 1000 * (v - c.min) / (c.max - c.min); }
  function snap(c, v) {
    if (c.unit === "Hz" || c.unit === "Ω") { const e = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))) - 2); return Math.round(v / e) * e; }
    if (c.unit === "Vpp") { const e = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-3))) - 2); return Math.round(v / e) * e; }
    if (c.unit === "V") return Math.round(v * 1e5) / 1e5;
    return v;
  }

  function renderControls() {
    const box = $("#controls");
    let h = "";
    if (EXP.circuits.length > 1) {
      h += `<div class="ctl"><div class="ctl-h">电路</div><div class="seg wrap">${EXP.circuits.map((c) => `<button data-circuit="${c.id}" class="${state.p.circuit === c.id ? "on" : ""}">${c.name}</button>`).join("")}</div></div>`;
    }
    if (EXP.presets) {
      h += `<div class="ctl"><div class="ctl-h">预设（对应教案）</div><div class="chips">${EXP.presets.map((p, i) => `<button data-preset="${i}">${p.name}</button>`).join("")}</div></div>`;
    }
    EXP.controls.forEach((c, i) => {
      if (c.when && !c.when(state.p)) return;
      const v = getK(state.p, c.key);
      if (c.type === "seg") {
        h += `<div class="ctl"><div class="ctl-h">${c.label}</div><div class="seg">${c.options.map(([val, lab], j) => `<button data-ctl="${i}" data-opt="${j}" class="${String(v) === String(val) ? "on" : ""}">${lab}</button>`).join("")}</div></div>`;
      } else {
        h += `<div class="ctl"><div class="ctl-h">${c.label}<output id="out-${i}">${fmtCtl(c, v)}</output></div>
          <input type="range" min="0" max="1000" step="1" value="${valToSlider(c, v)}" data-ctl="${i}" aria-label="${c.label}">
          ${c.presets ? `<div class="chips mini">${c.presets.map((pv) => `<button data-ctl="${i}" data-val="${pv}">${fmtCtl(c, pv)}</button>`).join("")}</div>` : ""}</div>`;
      }
    });
    box.innerHTML = h;
    $$("[data-circuit]", box).forEach((b) => b.addEventListener("click", () => {
      state.p.circuit = b.dataset.circuit;
      const pr = EXP.probes;
      state.probes = Object.assign({}, pr);
      if (state.p.circuit === "suminv" || state.p.circuit === "addsub") { state.probes.ch1 = "u1"; }
      update(true);
    }));
    $$("[data-preset]", box).forEach((b) => b.addEventListener("click", () => {
      state.p = deepMerge(state.p, EXP.presets[+b.dataset.preset].p);
      update(true);
    }));
    $$("button[data-opt]", box).forEach((b) => b.addEventListener("click", () => {
      const c = EXP.controls[+b.dataset.ctl];
      setK(state.p, c.key, c.options[+b.dataset.opt][0]);
      update(c.rebuild || c.key === "src.type" || c.key === "load50");
    }));
    $$("input[type=range]", box).forEach((inp) => {
      const c = EXP.controls[+inp.dataset.ctl];
      inp.addEventListener("input", () => {
        const v = snap(c, sliderToVal(c, +inp.value));
        setK(state.p, c.key, v);
        $("#out-" + inp.dataset.ctl).textContent = fmtCtl(c, v);
        scheduleUpdate(c.rebuild);
      });
    });
    $$("button[data-val]", box).forEach((b) => b.addEventListener("click", () => {
      const c = EXP.controls[+b.dataset.ctl];
      setK(state.p, c.key, +b.dataset.val);
      update(c.rebuild);
    }));
  }
  let pend = null;
  function scheduleUpdate(rebuild) {
    clearTimeout(pend);
    pend = setTimeout(() => update(rebuild, true), rebuild ? 120 : 40);
  }

  // ---- 原理图与探头
  const roleName = { ch1: "CH1", ch2: "CH2", dmm: "万用表" };
  function renderSchematic() {
    const assign = {};
    for (const r of ["ch1", "ch2", "dmm"]) { const n = state.probes[r]; if (n) (assign[n] = assign[n] || []).push(r); }
    const lay = window.Schematics.render($("#schematic"), kindOf(state.p), paramsFor(state.p), assign, (node) => {
      state.probes[state.role] = state.probes[state.role] === node && state.role !== "dmm" ? null : node;
      renderSchematic(); resetBuffers(); syncProbeLabels();
    });
    live.probeLabels = Object.fromEntries(lay.probes.map((p) => [p.node, p.label]));
    for (const r of ["ch1", "ch2", "dmm"]) if (state.probes[r] && !live.probeLabels[state.probes[r]]) state.probes[r] = null;
    syncProbeLabels();
  }
  function syncProbeLabels() {
    const L = live.probeLabels || {};
    $("#lab-ch1").textContent = state.probes.ch1 ? L[state.probes.ch1] : "未接";
    $("#lab-ch2").textContent = state.probes.ch2 ? L[state.probes.ch2] : "未接";
    $("#lab-dmm").textContent = state.probes.dmm ? L[state.probes.dmm] : "未接";
  }
  $$("#roles button").forEach((b) => b.addEventListener("click", () => {
    state.role = b.dataset.role;
    $$("#roles button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));

  // ---- 仿真生命周期
  function rebuild() {
    const kind = kindOf(state.p), p = paramsFor(state.p);
    try {
      const sv = new Solver(Cc.build[kind](p));
      const uic = EXP.uic && EXP.uic(state.p);
      if (uic) sv.uic(); else if (!sv.op()) throw new Error("直流工作点不收敛");
      live.sv = sv;
      live.err = null;
    } catch (e) { live.sv = null; live.err = e.message; }
    live.simT = 0; live.ff = null;
    retune();
    computeBode();
  }
  function retune() {
    const p = paramsFor(state.p);
    if (live.sv && kindOf(state.p) !== "gen") {
      for (const d of live.sv.ckt.devs) {
        if (d.kind !== "V") continue;
        if (["Vs", "Vi", "Vg", "V1"].includes(d.name)) d.wave = Cc.wave(p.src);
        if (d.name === "V2") d.wave = Cc.wave(p.src2);
      }
    }
    live.f = state.p.src.f; live.T = 1 / live.f;
    live.h = live.T / (EXP.ppc || 400);
    resetBuffers();
    if (bode && bode.last) { bode.last.marker = live.f; bode.draw(bode.last); }
  }
  function resetBuffers() {
    const n = Math.round((EXP.ppc || 400) * 6);
    live.N = n; live.w = 0; live.count = 0;
    live.buf = { t: new Float64Array(n), ch1: new Float64Array(n), ch2: new Float64Array(n), dmm: new Float64Array(n) };
    live.idx = {};
    if (live.sv) for (const r of ["ch1", "ch2", "dmm"]) { const nn = state.probes[r]; const i = nn ? live.sv.ckt.nodes.get(nn) : undefined; live.idx[r] = i === undefined ? -2 : i; }
    live.hist = []; live.lastMeasT = 0;
  }
  function update(rebuildCircuit, fromSlider) {
    if (!fromSlider) renderControls();
    renderSchematic();
    if (rebuildCircuit || !live.sv || kindOf(state.p) === "gen") rebuild(); else retune();
  }

  function computeBode() {
    if (!bode) return;
    const b = EXP.bode;
    try {
      const pts = Cc.sweep(kindOf(state.p), paramsFor(state.p), Cc.logspace(Math.log10(b.fmin), Math.log10(b.fmax), 241), b.out, b.in);
      let fc = null, lvl = null, fcLabel = "fc";
      if (b.cutoff) {
        const lp = state.p.circuit === "lpf";
        const ref = lp ? pts[0].mag : pts[pts.length - 1].mag;
        const dense = Cc.sweep(kindOf(state.p), paramsFor(state.p), Cc.logspace(Math.log10(b.fmin), Math.log10(b.fmax), 1201), b.out, b.in);
        fc = Cc.cutoff(dense, ref, lp ? "lp" : "hp"); lvl = ref / Math.SQRT2; fcLabel = lp ? "fH" : "fL";
      } else {
        const g = pts.map((p) => p.mag), gmax = Math.max(...g);
        for (let i = 1; i < pts.length; i++) if (g[i - 1] < gmax / Math.SQRT2 && g[i] >= gmax / Math.SQRT2) { fc = Math.exp(Math.log(pts[i - 1].f) + (gmax / Math.SQRT2 - g[i - 1]) / (g[i] - g[i - 1]) * Math.log(pts[i].f / pts[i - 1].f)); break; }
        lvl = gmax / Math.SQRT2; fcLabel = "fL";
      }
      bode.draw({ pts, fmin: b.fmin, fmax: b.fmax, marker: live.f, fc, lvl, fcLabel, db: b.db, unit: b.unit });
      const at = pts.reduce((a, p) => (Math.abs(Math.log(p.f / live.f)) < Math.abs(Math.log(a.f / live.f)) ? p : a), pts[0]);
      $("#bode-read").innerHTML = `当前 f = ${si(live.f, "Hz")}：${b.db ? "|Au| ≈ " + at.mag.toFixed(1) + "（" + (20 * Math.log10(at.mag)).toFixed(1) + " dB）" : "Uo ≈ " + at.mag.toFixed(3) + " V"}${fc ? `　·　${fcLabel} = ${si(fc, "Hz", 4)}` : ""}`;
    } catch (e) { $("#bode-read").textContent = "扫频失败：" + e.message; }
  }

  // ---- 实时循环
  function stepChunk(budgetMs) {
    const sv = live.sv; if (!sv) return;
    const t0 = performance.now();
    const B = live.buf, idx = live.idx, N = live.N;
    const ff = live.ff;
    const h = ff ? live.T / 60 : live.h;
    let k = 0;
    while (performance.now() - t0 < budgetMs) {
      for (let j = 0; j < 40; j++) {
        if (!sv.step(h)) { live.err = "瞬态不收敛"; live.sv = null; return; }
        live.simT += h; k++;
        if (ff) { if (live.simT >= ff.until) { live.ff = null; resetBuffers(); return; } continue; }
        const w = live.w;
        B.t[w] = sv.t;
        B.ch1[w] = idx.ch1 >= 0 ? sv.x[idx.ch1] : idx.ch1 === -1 ? 0 : NaN;
        B.ch2[w] = idx.ch2 >= 0 ? sv.x[idx.ch2] : idx.ch2 === -1 ? 0 : NaN;
        B.dmm[w] = idx.dmm >= 0 ? sv.x[idx.dmm] : 0;
        live.w = (w + 1) % N; live.count++;
      }
    }
  }
  function linear(arr) { const N = live.N, n = Math.min(live.count, N), out = new Float64Array(n); const s = (live.w - n + N) % N; for (let i = 0; i < n; i++) out[i] = arr[(s + i) % N]; return out; }

  function frame() {
    if (state.running && !document.hidden && !$("#pane-bench").hidden) stepChunk(live.ff ? 24 : 12);
    drawInstruments();
    requestAnimationFrame(frame);
  }
  function zeroFreq(t, y) {
    let mx = -Infinity, mn = Infinity; for (const v of y) { if (v > mx) mx = v; if (v < mn) mn = v; }
    if (mx - mn < 1e-7) return NaN;
    const lvl = (mx + mn) / 2, tz = [];
    for (let i = 1; i < y.length; i++) if (y[i - 1] < lvl && y[i] >= lvl) tz.push(t[i - 1] + (lvl - y[i - 1]) / (y[i] - y[i - 1]) * (t[i] - t[i - 1]));
    if (tz.length < 2) return NaN;
    return (tz.length - 1) / (tz[tz.length - 1] - tz[0]);
  }
  function drawInstruments() {
    const st = $("#simstate");
    if (live.err) { st.innerHTML = `<span class="bad">⚠ ${live.err}</span>`; return; }
    if (live.ff) { st.innerHTML = `快进建立中… ${(100 * live.simT / live.ff.until).toFixed(0)}%`; return; }
    const t = linear(live.buf.t);
    const fr = { t, T: live.T };
    if (state.probes.ch1) fr.ch1 = linear(live.buf.ch1);
    if (state.probes.ch2) fr.ch2 = linear(live.buf.ch2);
    scope.on.ch1 = !!state.probes.ch1; scope.on.ch2 = !!state.probes.ch2;
    scope.draw(fr);
    const ppc = EXP.ppc || 400;
    const now = performance.now();
    if (t.length >= ppc * 4 && now - (live.lastMeasT || 0) > 150) {
      live.lastMeasT = now;
      const M = {};
      for (const ch of ["ch1", "ch2"]) if (fr[ch]) { M[ch] = measureTone(t, fr[ch], live.f, 4); M[ch].fz = zeroFreq(t, fr[ch]); }
      const r = (ch, k, v) => { const el = $(`#m-${ch}-${k}`); if (el) el.textContent = v; };
      for (const ch of ["ch1", "ch2"]) {
        const m = M[ch];
        r(ch, "vpp", m ? fmtV(m.vpp) : "—");
        r(ch, "f", m && isFinite(m.fz) ? si(m.fz, "Hz", 4) : "—");
        r(ch, "mean", m ? fmtV(m.dc) : "—");
        r(ch, "thd", m && m.a1 > 1e-6 ? m.thd.toFixed(2) + " %" : "—");
      }
      if (M.ch1 && M.ch2 && M.ch1.a1 > 1e-7) {
        const ph = phaseDiff(M.ch2, M.ch1);
        $("#m-gain").textContent = (M.ch2.vpp / M.ch1.vpp).toPrecision(4) + " ×";
        $("#m-phase").textContent = (ph > 0 ? "+" : "") + ph.toFixed(1) + "°";
      } else { $("#m-gain").textContent = "—"; $("#m-phase").textContent = "—"; }
      // 万用表
      const d = linear(live.buf.dmm).subarray(-ppc * 4);
      let s = 0; for (const v of d) s += v; const mean = s / d.length;
      let q = 0; for (const v of d) q += (v - mean) * (v - mean); const rms = Math.sqrt(q / d.length);
      const val = state.dmmMode === "DC" ? mean : rms;
      $("#dmm-val").textContent = state.probes.dmm ? (Math.abs(val) < 10 ? val.toFixed(4) : val.toFixed(3)) : "----";
      $("#dmm-unit").textContent = state.dmmMode === "DC" ? "V ⎓" : "V ~ rms";
      // 稳态判断
      if (M.ch2 || M.ch1) {
        const ref = (M.ch2 || M.ch1);
        live.hist.push([ref.vpp, ref.dc]); if (live.hist.length > 8) live.hist.shift();
        const vs = live.hist.map((x) => x[0]), ds = live.hist.map((x) => x[1]);
        const span = Math.max(...vs) - Math.min(...vs), dspan = Math.max(...ds) - Math.min(...ds);
        live.steady = live.hist.length >= 6 && span < 2e-3 * Math.max(...vs) + 1e-6 && dspan < 2e-3 * (Math.max(...vs) + Math.abs(ds[0])) + 1e-5;
      }
    }
    st.innerHTML = `仿真时间 <b>${si(live.simT, "s", 3)}</b>　·　步长 ${si(live.h, "s", 3)}　·　${t.length < ppc * 4 ? "采集中…" : live.steady ? '<span class="ok">● 稳态</span>' : '<span class="warm">● 建立中</span>'}`;
  }
  $("#btn-run").addEventListener("click", (e) => { state.running = !state.running; e.currentTarget.textContent = state.running ? "暂停" : "继续"; e.currentTarget.setAttribute("aria-pressed", !state.running); });
  $("#btn-reset").addEventListener("click", () => rebuild());
  $("#btn-ff").addEventListener("click", () => { if (live.sv) live.ff = { until: live.simT + Math.max(0.3, 30 * live.T) }; });
  $$("[data-coup]").forEach((b) => b.addEventListener("click", () => {
    const ch = b.dataset.coup; scope.coupling[ch] = scope.coupling[ch] === "AC" ? "DC" : "AC"; b.textContent = scope.coupling[ch];
  }));
  $("#dmm-mode").addEventListener("click", (e) => { state.dmmMode = state.dmmMode === "DC" ? "AC" : "DC"; e.currentTarget.textContent = state.dmmMode === "DC" ? "切到 AC" : "切到 DC"; });

  $("#tasks").innerHTML = EXP.tasks.map((t) => `<li>${t}</li>`).join("");

  // ================================================================ 数据表
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  function fmtCell(v, nd) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") return v;
    if (!isFinite(v)) return "—";
    if (nd === null || nd === undefined) return String(v);
    return (v < 0 ? "−" : "") + Math.abs(v).toFixed(nd);
  }
  function renderTables() {
    const box = $("#tables");
    box.innerHTML = EXP.tables.map((tb, ti) => {
      const head = `<tr>${tb.cols.map((c) => `<th>${c}</th>`).join("")}${tb.rows ? "<th class='act'></th>" : ""}</tr>`;
      let body = "";
      if (tb.static) body += tb.static.map((r) => `<tr>${r.map((c, j) => (j ? `<td>${c}</td>` : `<th scope="row">${c}</th>`)).join("")}</tr>`).join("");
      if (tb.inputRow) body += `<tr class="mine always"><th scope="row">${tb.inputRow}</th>${tb.cols.slice(1).map((_, j) => `<td><input data-k="${id}.${tb.id}.in.${j}" inputmode="decimal" aria-label="${tb.inputRow} 第 ${j + 1} 列"></td>`).join("")}</tr>`;
      if (tb.rows) body += tb.rows.map((r, ri) => {
        const n = tb.cols.length - 1;
        return `<tr data-t="${ti}" data-r="${ri}"><th scope="row">${r.label}</th>${Array.from({ length: n }, (_, j) => `<td class="v" data-c="${j}">·</td>`).join("")}
          <td class="act"><button class="ghostbtn" data-load="${ti}.${ri}" title="把这一行的条件载入实验台">载入实验台</button></td></tr>
          <tr class="mine" data-t="${ti}" data-r="${ri}"><th scope="row"><span>我的实测</span></th>${Array.from({ length: n }, (_, j) => `<td><input data-k="${id}.${tb.id}.${ri}.${j}" data-c="${j}" inputmode="decimal" aria-label="第 ${ri + 1} 行第 ${j + 1} 列实测值"><i class="dev"></i></td>`).join("")}<td></td></tr>`;
      }).join("");
      return `<section class="tbl reveal" id="tb-${ti}">
        <header><h3><span class="tno">表 ${tb.id}</span>${tb.title}</h3>
        <div class="tbl-act">${tb.rows ? `<button class="btn" data-run="${ti}">▶ 仿真测量${tb.slow ? "（较慢）" : ""}</button>` : ""}
        <button class="ghostbtn" data-csv="${ti}">导出 CSV</button></div></header>
        <div class="tscroll"><table class="${tb.wide ? "wide" : ""}"><thead>${head}</thead><tbody>${body}</tbody></table></div>
        <p class="tnote"><span class="badge" id="badge-${ti}"></span>${tb.note || ""}</p><p class="tafter" id="after-${ti}"></p></section>`;
    }).join("");
    $$("input[data-k]", box).forEach((inp) => {
      inp.value = store.get("mylab." + inp.dataset.k) || "";
      inp.addEventListener("input", () => { store.set("mylab." + inp.dataset.k, inp.value); updateDev(inp); });
    });
    $$("[data-run]", box).forEach((b) => b.addEventListener("click", () => runTable(+b.dataset.run)));
    $$("[data-csv]", box).forEach((b) => b.addEventListener("click", () => exportCSV(+b.dataset.csv)));
    $$("[data-load]", box).forEach((b) => b.addEventListener("click", () => {
      const [ti, ri] = b.dataset.load.split(".").map(Number);
      state.p = deepMerge(state.p, EXP.tables[ti].rows[ri].bench);
      showTab("bench"); update(true);
    }));
  }
  const results = {};
  function updateDev(inp) {
    const tr = inp.closest("tr.mine"); if (!tr || !tr.dataset.t) return;
    const sim = results[tr.dataset.t] && results[tr.dataset.t][tr.dataset.r];
    const i = inp.parentElement.querySelector(".dev");
    const v = parseFloat(inp.value.replace("−", "-"));
    const s = sim ? sim[+inp.dataset.c] : null;
    if (i) i.textContent = isFinite(v) && typeof s === "number" && s !== 0 ? `${(100 * (v - s) / Math.abs(s)).toFixed(1)}%` : "";
  }
  async function runTable(ti) {
    const tb = EXP.tables[ti];
    const btn = $(`[data-run="${ti}"]`); btn.disabled = true; btn.textContent = "测量中…";
    const ctx = {};
    results[ti] = [];
    let maxDev = 0, nCmp = 0;
    for (let ri = 0; ri < tb.rows.length; ri++) {
      const row = tb.rows[ri];
      const tr = $(`tr[data-t="${ti}"][data-r="${ri}"]:not(.mine)`);
      tr.classList.add("busy");
      await new Promise((r) => setTimeout(r, 16));
      let vals;
      try { vals = tb.run(row, ctx); } catch (e) { vals = tb.cols.slice(1).map(() => "错误"); console.error(e); }
      results[ti][ri] = vals;
      const ref = row.refv ? row.refv() : null;
      vals.forEach((v, j) => {
        const td = $(`td.v[data-c="${j}"]`, tr);
        td.textContent = fmtCell(v, tb.fmt[j]);
        td.classList.add("filled");
        if (ref && typeof v === "number" && typeof ref[j] === "number" && Math.abs(ref[j]) > 1e-9) {
          const dv = 100 * Math.abs(v - ref[j]) / Math.abs(ref[j]); maxDev = Math.max(maxDev, dv); nCmp++;
          td.title = `ngspice 参考值：${fmtCell(ref[j], (tb.fmt[j] ?? 3) + 1)}（偏差 ${dv.toFixed(3)}%）`;
        }
      });
      tr.classList.remove("busy");
      $$(`tr.mine[data-t="${ti}"][data-r="${ri}"] input`).forEach(updateDev);
    }
    if (nCmp) $(`#badge-${ti}`).innerHTML = `<b>✓</b> ${nCmp} 个数与 ngspice 对照，最大偏差 ${maxDev < 0.01 ? "< 0.01" : maxDev.toFixed(2)}%`;
    if (tb.after) $(`#after-${ti}`).innerHTML = tb.after();
    btn.disabled = false; btn.textContent = "↻ 重新测量";
  }
  function exportCSV(ti) {
    const tb = EXP.tables[ti];
    const strip = (s) => String(s).replace(/<[^>]+>/g, "").replace(/,/g, "，");
    const lines = [tb.cols.map(strip).join(",")];
    (tb.static || []).forEach((r) => lines.push(r.map(strip).join(",")));
    if (tb.inputRow) lines.push([strip(tb.inputRow), ...tb.cols.slice(1).map((_, j) => store.get(`mylab.${id}.${tb.id}.in.${j}`) || "")].join(","));
    (tb.rows || []).forEach((r, ri) => {
      const v = results[ti] && results[ti][ri];
      lines.push([strip(r.label) + "（仿真）", ...tb.cols.slice(1).map((_, j) => (v ? strip(fmtCell(v[j], tb.fmt[j])) : ""))].join(","));
      const mine = tb.cols.slice(1).map((_, j) => store.get(`mylab.${id}.${tb.id}.${ri}.${j}`) || "");
      if (mine.some((x) => x)) lines.push([strip(r.label) + "（实测）", ...mine].join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `实验${EXP.no}_表${tb.id}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("#btn-runall").addEventListener("click", async () => { for (let i = 0; i < EXP.tables.length; i++) if (EXP.tables[i].rows) await runTable(i); });
  $("#mine-toggle").addEventListener("change", (e) => $("#tables").classList.toggle("show-mine", e.target.checked));

  // ================================================================ 讲解 / 思考题
  $("#theory").innerHTML = TXT.theory || "";
  $("#pitfalls").innerHTML = (TXT.pitfalls || []).map((x) => `<li>${x}</li>`).join("");
  $("#qa").innerHTML = (TXT.qa || []).map(([q, a], i) => `<details class="reveal"><summary><span class="qn">${i + 1}</span>${q}</summary><div>${a}</div></details>`).join("");
  function renderMath(el) {
    if (!el || el.dataset.math || typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(el, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false });
    el.dataset.math = "1";
  }
  window.addEventListener("load", () => { if (!$("#pane-theory").hidden) renderMath($("#pane-theory")); if (!$("#pane-qa").hidden) renderMath($("#pane-qa")); });
  if (id === "p" && window.ColorCode) window.ColorCode($("#colorcode"));

  // ================================================================ 启动
  renderTables();
  update(true);
  const tab = (location.hash || "#bench").slice(1);
  showTab(["bench", "theory", "data", "qa"].includes(tab) ? tab : "bench");
  requestAnimationFrame(frame);
  // 调试/测试钩子：在后台标签页（rAF 暂停）时手动推进仿真
  window.LabDebug = { tick(n = 10) { for (let i = 0; i < n; i++) { stepChunk(12); } live.lastMeasT = 0; drawInstruments(); }, state, live, showTab };
})();
