/* =====================================================================
 * circuits.js — 各实验电路的网表构造 + 标准测量流程
 * 节点命名与 ngspice 校验网表一致，便于逐项对照。
 * ===================================================================== */
(function (root) {
  "use strict";
  const S = root.AnalogSim || (typeof require !== "undefined" ? require("./engine.js") : null);
  const { Circuit, Solver, measureTone, phaseDiff } = S;

  // 信号源：vpp 峰峰值；square 时 amp=vpp/2
  function wave(src) {
    if (!src) return { dc: 0 };
    if (src.type === "square") return { type: "square", amp: src.vpp / 2, f: src.f, tr: src.tr || 1e-8, delay: src.delay || 0 };
    if (src.type === "dc") return { dc: src.v };
    return { type: "sin", amp: src.vpp / 2, f: src.f, phase: src.phase || 0 };
  }

  const B = {};

  /** 单级共射放大电路（图 1-1 ~ 2-5） */
  B.ce = (p) => {
    const c = new Circuit();
    c.V("VCC", "vcc", "0", { dc: 12 });
    c.V("Vs", "us", "0", wave(p.src), 1);
    c.R("R1", "us", "ui", 5.1e3);
    if (p.R2 !== false) c.R("R2", "ui", "0", 51);
    c.C("C1", "ui", "a", 10e-6);
    c.R("R3", "vcc", "a", p.R3 || 100e3);
    c.R("R5", "a", "0", p.R5 || 24e3);
    c.R("R4", "vcc", "c", p.R4 || 5.1e3);
    c.Q("Q1", "c", "a", "e");
    c.R("R6", "e", "e2", 100);
    c.R("R7", "e2", "0", 1.8e3);
    c.C("C3", p.bypass === "R7" ? "e2" : "e", "0", 10e-6);
    c.C("C2", "c", "o", 10e-6);
    c.R(p.RL ? "RL" : "Rscope", "o", "0", p.RL || 1e6);
    return c;
  };

  /** 实验 P：信号源 → 示波器 */
  B.gen = (p) => {
    const c = new Circuit();
    const emf = Object.assign({}, p.src, { vpp: p.src.vpp * (p.load50 ? 2 : 1) });
    c.V("Vg", "g", "0", wave(emf), 1);
    c.R("Rs", "g", "o", 50);
    c.R("Rscope", "o", "0", 1e6);
    c.C("Cscope", "o", "0", 16e-12);
    return c;
  };

  function opSrc(c, name, node, src, rs) {
    if (rs) { c.V(name, node + "_g", "0", wave(src), 1); c.R(name + "_rs", node + "_g", node, rs); }
    else c.V(name, node, "0", wave(src), 1);
  }

  B.follower = (p) => { const c = new Circuit(); opSrc(c, "Vi", "ui", p.src); c.OA("U1", "ui", "uo", "uo"); if (p.RL) c.R("RL", "uo", "0", p.RL); return c; };
  B.inverting = (p) => {
    const c = new Circuit(); opSrc(c, "Vi", "ui", p.src);
    c.R("R1", "p", "0", 10e3); c.R("R2", "ui", "n", 10e3); c.R("RF", "n", "uo", 100e3); c.OA("U1", "p", "n", "uo");
    if (p.RL) c.R("RL", "uo", "0", p.RL); return c;
  };
  B.noninv = (p) => {
    const c = new Circuit(); opSrc(c, "Vi", "ui", p.src);
    c.R("R1", "ui", "p", 10e3); c.R("R2", "n", "0", 10e3); c.R("RF", "n", "uo", 100e3); c.OA("U1", "p", "n", "uo");
    if (p.RL) c.R("RL", "uo", "0", p.RL); return c;
  };
  B.suminv = (p) => {
    const c = new Circuit(); opSrc(c, "V1", "u1", p.src); opSrc(c, "V2", "u2", p.src2);
    c.R("R1", "p", "0", 10e3); c.R("R2", "u1", "n", 10e3); c.R("R3", "u2", "n", 10e3); c.R("RF", "n", "uo", 100e3);
    c.OA("U1", "p", "n", "uo"); return c;
  };
  B.addsub = (p) => {
    const c = new Circuit(); opSrc(c, "V1", "u1", p.src); opSrc(c, "V2", "u2", p.src2);
    c.R("R2", "u1", "p", 10e3); c.R("R1", "p", "0", p.R1 || 10e3); c.R("R3", "u2", "n", 10e3); c.R("RF", "n", "uo", 100e3);
    c.OA("U1", "p", "n", "uo"); return c;
  };
  B.integrator = (p) => {
    const c = new Circuit(); opSrc(c, "Vg", "ui", p.src, 50);
    c.R("R1", "p", "0", 10e3); c.R("R2", "ui", "n", 10e3); c.C("C1", "n", "uo", 100e-9, 0);
    if (p.rpar) c.R("R3", "n", "uo", 100e3);
    c.OA("U1", "p", "n", "uo", { vos: p.vos || 0 }); return c;
  };
  B.differentiator = (p) => {
    const c = new Circuit(); opSrc(c, "Vg", "ui", p.src, 50);
    c.R("R1", "p", "0", 10e3); c.C("C1", "ui", "n", 220e-9, 0); c.R("Rf", "n", "uo", 10e3);
    c.OA("U1", "p", "n", "uo"); return c;
  };
  B.intdiff = (p) => {
    const c = new Circuit(); opSrc(c, "Vg", "ui", p.src, 50);
    c.R("R1", "p1", "0", 10e3); c.R("R2", "ui", "n1", 10e3); c.C("C1", "n1", "u1", 100e-9, 0); c.R("R3", "n1", "u1", 100e3);
    c.OA("U1", "p1", "n1", "u1");
    if (p.rd) { c.R("Rd", "u1", "u1d", 1e3); c.C("C2", "u1d", "n2", 220e-9, 0); } else c.C("C2", "u1", "n2", 220e-9, 0);
    c.R("R4", "p2", "0", 10e3); c.R("R5", "n2", "uo", 10e3); c.OA("U2", "p2", "n2", "uo"); return c;
  };
  B.lpf = (p) => {
    const c = new Circuit(); opSrc(c, "Vi", "ui", p.src);
    c.R("R3", "ui", "x", 10e3); c.R("R2", "x", "p", 10e3); c.C("C1", "x", "uo", 10e-9, 0); c.C("C2", "p", "0", 10e-9, 0);
    c.R("R1", "n", "0", 10e3); c.R("Rf", "n", "uo", Math.max(p.Rf, 1e-3)); c.OA("U1", "p", "n", "uo"); return c;
  };
  B.hpf = (p) => {
    const c = new Circuit(); opSrc(c, "Vi", "ui", p.src);
    c.C("C1", "ui", "x", 100e-9, 0); c.C("C2", "x", "p", 100e-9, 0); c.R("R1", "x", "uo", 10e3); c.R("R2", "p", "0", 10e3);
    c.R("R3", "n", "0", 10e3); c.R("Rf", "n", "uo", Math.max(p.Rf, 1e-3)); c.OA("U1", "p", "n", "uo"); return c;
  };

  // ---------------------------------------------------------------- 标准测量流程
  /** 稳态瞬态测量：返回 {data, meas: {node: measureTone}}；opts.uic 从电容初值起步 */
  function steady(kind, p, opts) {
    const o = Object.assign({ settleCycles: 20, keepCycles: 4, ppc: 400, probes: [] }, opts);
    const f = p.src.f, T = 1 / f, h = T / o.ppc;
    const sv = new Solver(B[kind](p));
    if (o.uic) sv.uic(); else if (!sv.op()) throw new Error("工作点不收敛");
    let data;
    if (o.settlePpc) {           // 先用粗步长建立稳态，再用细步长记录
      sv.run(o.settleCycles * T, T / o.settlePpc, []);
      data = sv.run(o.keepCycles * T, h, o.probes, 0);
    } else {
      const dur = (o.settleCycles + o.keepCycles) * T;
      data = sv.run(dur, h, o.probes, o.settleCycles * T);
    }
    const meas = {};
    for (const pr of o.probes) meas[pr] = measureTone(data.t, data[pr], f, o.keepCycles);
    return { data, meas, solver: sv };
  }
  /** 直流工作点 */
  function dcop(kind, p) {
    const sv = new Solver(B[kind](p));
    if (!sv.op()) throw new Error("工作点不收敛");
    const q = sv.ckt.devs.find((d) => d.kind === "Q");
    return { solver: sv, v: (n) => sv.node(n), q: q ? q.op : null };
  }
  /** 交流扫频：|H| = |V(out)/V(in)| */
  function sweep(kind, p, freqs, outNode, inNode) {
    const sv = new Solver(B[kind](p));
    if (!sv.op()) throw new Error("工作点不收敛");
    const r = sv.ac(freqs, inNode ? [outNode, inNode] : [outNode]);
    return freqs.map((f, i) => {
      const o = r[outNode][i];
      let re = o.re, im = o.im;
      if (inNode) { const a = r[inNode][i]; const den = a.re * a.re + a.im * a.im; re = (o.re * a.re + o.im * a.im) / den; im = (o.im * a.re - o.re * a.im) / den; }
      return { f, mag: Math.hypot(re, im), ph: Math.atan2(im, re) * 180 / Math.PI };
    });
  }
  function logspace(a, b, n) { const out = []; for (let i = 0; i < n; i++) out.push(Math.pow(10, a + (b - a) * i / (n - 1))); return out; }
  /** 求 0.707 截止频率（相对参考增益 ref），kind='lp' 找下降沿，'hp' 找上升沿 */
  function cutoff(pts, ref, kind) {
    const lvl = ref / Math.SQRT2;
    let kmax = 0; pts.forEach((p, i) => { if (p.mag > pts[kmax].mag) kmax = i; });
    if (kind === "lp") { for (let i = kmax; i < pts.length - 1; i++) if (pts[i].mag >= lvl && pts[i + 1].mag < lvl) return interpLog(pts[i], pts[i + 1], lvl); }
    else { for (let i = kmax; i > 0; i--) if (pts[i].mag >= lvl && pts[i - 1].mag < lvl) return interpLog(pts[i - 1], pts[i], lvl); }
    return NaN;
  }
  function interpLog(p1, p2, lvl) { const r = (lvl - p1.mag) / (p2.mag - p1.mag); return Math.exp(Math.log(p1.f) + r * (Math.log(p2.f) - Math.log(p1.f))); }

  const API = { build: B, wave, steady, dcop, sweep, logspace, cutoff, measureTone, phaseDiff };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.Circuits = API;
})(typeof window !== "undefined" ? window : globalThis);
