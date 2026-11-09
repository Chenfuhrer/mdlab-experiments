/* 首页：实时示波器 + 实验目录 + 引擎校验表 */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const { Solver } = window.AnalogSim;
  const C = window.Circuits;

  // ---------------- 实验目录
  const SEE = {
    p: "信号源“高阻 / 50 Ω”设错时，示波器读数为什么翻倍；色环电阻读数器。",
    "1": "Au ≈ −147、相位差 ≈ 180°；改 R4、R5、C3 位置时增益如何变化。",
    "2": "Ro、Ri 的串联电阻测量法；Q 点偏高削底、偏低削顶。",
    "3": "−10 倍、11 倍、求和与加减；输出摆幅造成的削顶。",
    "4": "正弦超前/滞后 90°，方波变三角波和尖脉冲；积分漂移与微分振铃。",
    "5": "Sallen-Key 低通/高通的幅频曲线；Rf 如何改变 Q 与截止频率。",
  };
  const grid = $("#exp-grid");
  window.EXP_ORDER.forEach((k, i) => {
    const e = window.EXP[k];
    const a = document.createElement("a");
    a.className = "exp-card reveal";
    a.style.animationDelay = (0.04 * i) + "s";
    a.href = `lab.html?e=${k}`;
    a.innerHTML = `<div class="exp-thumb" aria-hidden="true"></div>
      <div class="exp-body"><span class="exp-no">${e.no === "P" ? "P" : "0" + e.no}</span>
      <h3>${e.title.replace("集成运放的应用——", "运放 · ")}</h3><p class="exp-lead">${e.lead}</p>
      <p class="exp-see"><b>你会看到</b>${SEE[k]}</p>
      <span class="exp-meta">${e.tables.length} 张数据表 · ${e.circuits.length > 1 ? e.circuits.length + " 个电路" : "1 个电路"}</span></div>`;
    grid.appendChild(a);
    const kind = e.defaults.circuit;
    const tp = k === "2" ? Object.assign({}, e.defaults, { RL: 5100, R2: false }) : e.defaults;
    window.Schematics.render(a.querySelector(".exp-thumb"), kind, tp, {}, null);
  });

  $("#ntab").textContent = window.EXP_ORDER.reduce((a, k) => a + window.EXP[k].tables.length, 0);

  // ---------------- 引擎校验
  const V = window.VALID;
  if (V) {
    const groups = {};
    V.rows.forEach((r) => { (groups[r.group] = groups[r.group] || []).push(r); });
    const mx = V.maxAbsErr;
    $("#maxerr").textContent = (mx < 0.01 ? "<0.01" : mx.toFixed(2)) + "%";
    $("#engine-stats").innerHTML = `
      <div class="stat"><b>${V.n}</b><span>项对照（静态、动态、频响、失真、滤波器）</span></div>
      <div class="stat"><b>${mx.toFixed(2)}%</b><span>最大相对偏差</span></div>
      <div class="stat"><b>${Object.keys(groups).length}</b><span>组测试，覆盖全部 6 个实验</span></div>`;
    const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(4));
    $("#valid-table").innerHTML = `<thead><tr><th>分组</th><th>项目</th><th>浏览器引擎</th><th>ngspice-47</th><th>偏差</th></tr></thead><tbody>` +
      V.rows.map((r) => `<tr><td>${r.group}</td><th scope="row">${r.item}</th><td class="v filled">${fmt(r.js)} ${r.unit}</td><td class="v filled">${fmt(r.spice)} ${r.unit}</td><td class="v filled">${Math.abs(r.err) < 0.001 ? "<0.001" : r.err.toFixed(3)}%</td></tr>`).join("") + "</tbody>";
  }

  // ---------------- 实时示波器
  const scope = new window.Instruments.Scope($("#hero-scope"));
  const f = 1e4, T = 1 / f, ppc = 200, h = T / ppc;
  const sv = new Solver(C.build.ce({ src: { type: "sin", vpp: 1, f } }));
  sv.op();
  const vs = sv.ckt.devs.find((d) => d.name === "Vs");
  const iUi = sv.ckt.nodes.get("ui"), iO = sv.ckt.nodes.get("o");
  const N = ppc * 6;
  const buf = { t: new Float64Array(N), a: new Float64Array(N), b: new Float64Array(N) };
  let w = 0, cnt = 0, phase = 0, lastRead = 0;
  function tick(now) {
    if (!document.hidden) {
      const t0 = performance.now();
      while (performance.now() - t0 < 6) {
        for (let j = 0; j < 20; j++) {
          sv.step(h);
          buf.t[w] = sv.t; buf.a[w] = sv.x[iUi]; buf.b[w] = sv.x[iO];
          w = (w + 1) % N; cnt++;
        }
      }
      phase += 1 / 60;
      const us = 2.1 + 1.5 * Math.sin(phase * 2 * Math.PI / 9);
      vs.wave = C.wave({ type: "sin", vpp: us, f });
      const n = Math.min(cnt, N), s = (w - n + N) % N;
      const lin = (arr) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = arr[(s + i) % N]; return o; };
      const fr = { t: lin(buf.t), ch1: lin(buf.a), ch2: lin(buf.b), T };
      scope.vdivFix = { ch1: 0.01, ch2: 1 };
      scope.draw(fr);
      if (now - lastRead > 250 && n > ppc * 3) {
        lastRead = now;
        const mi = C.measureTone(fr.t, fr.ch1, f, 3), mo = C.measureTone(fr.t, fr.ch2, f, 3);
        $("#hero-read").innerHTML = `U<sub>s</sub> ${us.toFixed(2)} Vpp · |Au| ${(mo.vpp / mi.vpp).toFixed(1)} · THD ${mo.thd.toFixed(1)}%`;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
