/* 用 ngspice 结果校验浏览器仿真引擎：node tools/validate.js
 * 读取 data/reference.json（ngspice 结果），在 JS 引擎里按相同条件重算，输出误差并写入 data/validation.json */
const fs = require("fs");
const path = require("path");
const C = require("../js/circuits.js");
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/reference.json"), "utf8"));
const settleFull = process.argv.includes("--full");

const rows = [];
function cmp(group, item, js, sp, unit = "", tol = 1) {
  const err = sp === 0 ? Math.abs(js) : 100 * (js - sp) / Math.abs(sp);
  rows.push({ group, item, js, spice: sp, unit, err });
}
const t0 = Date.now();
const e1 = ref.exp12.exp1, e2 = ref.exp12.exp2;
const cfg = { "1-1": {}, "1-2": { R4: 9e3 }, "1-3": { R5: 15e3 }, "1-4": { bypass: "R7" } };

// ---- 实验 1 静态
for (const [k, p] of Object.entries(cfg)) {
  const o = C.dcop("ce", Object.assign({ src: { type: "sin", vpp: 0, f: 1e4 } }, p));
  const s = e1.static[k];
  cmp("实验1 静态", `图${k} U_B`, o.v("a"), s.UB, "V");
  cmp("实验1 静态", `图${k} U_C`, o.v("c"), s.UC, "V");
  cmp("实验1 静态", `图${k} U_E`, o.v("e"), s.UE, "V");
}
// ---- 实验 1 动态（10 kHz）
const SET = settleFull ? 1000 : 60;
for (const [k, p] of Object.entries(cfg)) {
  e1.dyn[k].forEach((s) => {
    const r = C.steady("ce", Object.assign({ src: { type: "sin", vpp: s.Us, f: 1e4 } }, p), { settleCycles: SET, keepCycles: 5, probes: ["ui", "o"] });
    const au = r.meas.o.vpp / r.meas.ui.vpp;
    cmp("实验1 动态", `图${k} Us=${s.Us.toFixed(1)}Vpp |Au|`, au, Math.abs(s.Au));
    cmp("实验1 动态", `图${k} Us=${s.Us.toFixed(1)}Vpp THD`, r.meas.o.thd, s.thd, "%");
  });
}
// ---- 实验 1 频响
for (const k of ["1-1", "1-4"]) {
  const pts = C.sweep("ce", Object.assign({ src: { type: "sin", vpp: 0, f: 1e4 } }, cfg[k]), C.logspace(0, 7, 281), "o", "ui");
  const amid = Math.max(...pts.map((p) => p.mag));
  cmp("实验1 频响", `图${k} 中频增益`, amid, e1.ac[k].Amid);
  // fL
  let fl = NaN; for (let i = 1; i < pts.length; i++) if (pts[i - 1].mag < amid / Math.SQRT2 && pts[i].mag >= amid / Math.SQRT2) { fl = Math.exp(Math.log(pts[i - 1].f) + (amid / Math.SQRT2 - pts[i - 1].mag) / (pts[i].mag - pts[i - 1].mag) * Math.log(pts[i].f / pts[i - 1].f)); break; }
  cmp("实验1 频响", `图${k} 下限截止频率 fL`, fl, e1.ac[k].fL, "Hz");
}
// ---- 实验 2：Ro、Ri
e2.RL_rows.forEach((s) => {
  const RL = s.RL === "∞" ? null : parseFloat(s.RL) * 1e3;
  const r = C.steady("ce", { src: { type: "sin", vpp: 1, f: 1e4 }, RL }, { settleCycles: SET, keepCycles: 5, probes: ["ui", "o"] });
  cmp("实验2 带载", `RL=${s.RL} Uo`, r.meas.o.vpp, s.Uo, "Vpp");
});
e2.Ri_rows.forEach((s) => {
  const r = C.steady("ce", { src: { type: "sin", vpp: s.Us, f: 1e4 }, R2: false }, { settleCycles: SET, keepCycles: 5, probes: ["us", "a"] });
  const Ri = r.meas.a.vpp / (r.meas.us.vpp - r.meas.a.vpp) * 5.1;
  cmp("实验2 输入电阻", `Us=${(s.Us * 1e3).toFixed(0)}mVpp Ri`, Ri, s.Ri_k, "kΩ");
});
// ---- 实验 2：失真
const SETD = settleFull ? 3000 : 400;
e2.dist.forEach((s) => {
  const r = C.steady("ce", { src: { type: "sin", vpp: s.Us, f: 1e4 }, R3: s.R3_k * 1e3 }, { settleCycles: SETD, keepCycles: 5, probes: ["o"] });
  cmp("实验2 失真", `${s.tag} Us=${s.Us}Vpp 正峰`, r.meas.o.vmax, s.Uo_max, "V");
  cmp("实验2 失真", `${s.tag} Us=${s.Us}Vpp 负峰`, r.meas.o.vmin, s.Uo_min, "V");
});
// ---- 实验 3
const e3 = ref.exp3;
for (const [name, kind] of [["follower", "follower"], ["inverting", "inverting"], ["noninv", "noninv"]]) {
  e3[name].forEach((s) => {
    const r = C.steady(kind, { src: { type: "sin", vpp: s.Ui, f: 1e3 }, RL: 5.1e3 }, { settleCycles: 4, keepCycles: 4, ppc: 500, probes: ["ui", "uo"] });
    cmp("实验3 比例", `${name} Ui=${s.Ui}Vpp Uo`, r.meas.uo.vpp, s["5k1"].Uo, "Vpp");
  });
}
e3.sum.forEach((s) => {
  const kind = s.fig === "3-4" ? "suminv" : "addsub";
  const src = (v) => ({ type: "sin", vpp: Math.abs(v), f: 1e3, phase: v < 0 ? 180 : 0 });
  const r = C.steady(kind, { src: src(s.Ui1), src2: src(s.Ui2) }, { settleCycles: 4, keepCycles: 4, ppc: 500, probes: ["uo"] });
  const sign = Math.cos(r.meas.uo.ph1 * Math.PI / 180) >= 0 ? 1 : -1;
  cmp("实验3 求和", `图${s.fig} (${s.Ui1}, ${s.Ui2}) Uo`, sign * r.meas.uo.vpp, s.Uo, "V");
});
// ---- 实验 4
const e4 = ref.exp4;
{
  let r = C.steady("integrator", { src: { type: "sin", vpp: 2, f: 100, phase: 90 } }, { uic: true, settleCycles: 2, keepCycles: 4, ppc: 2000, probes: ["uo"] });
  cmp("实验4 积分", "正弦 Uo 峰峰值", r.meas.uo.vpp, e4.int_sine.Uo_pp, "Vpp");
  r = C.steady("integrator", { src: { type: "square", vpp: 2, f: 100, delay: 2.5e-3 } }, { uic: true, settleCycles: 2, keepCycles: 4, ppc: 2000, probes: ["uo"] });
  cmp("实验4 积分", "方波 三角波峰峰值", r.meas.uo.vpp, e4.int_square.Uo_pp, "Vpp");
  r = C.steady("differentiator", { src: { type: "sin", vpp: 1, f: 100 } }, { settleCycles: 2, keepCycles: 4, ppc: 2000, probes: ["uo"] });
  cmp("实验4 微分", "正弦 Uo 峰峰值", r.meas.uo.vpp, e4.diff_sine.Uo_pp, "Vpp");
  r = C.steady("differentiator", { src: { type: "square", vpp: 0.1, f: 100, delay: 2.5e-3 } }, { settleCycles: 1, keepCycles: 4, ppc: 50000, probes: ["uo"] });
  cmp("实验4 微分", "方波 尖脉冲峰值", r.meas.uo.vmax, e4.diff_square.Uo_max, "V");
  r = C.steady("intdiff", { src: { type: "sin", vpp: 2, f: 100 } }, { settleCycles: 26, keepCycles: 4, ppc: 2000, probes: ["uo"] });
  cmp("实验4 积分-微分", "正弦 Uo 峰峰值", r.meas.uo.vpp, e4.intdiff_sine.Uo_pp, "Vpp");
  r = C.steady("intdiff", { src: { type: "square", vpp: 2, f: 100 }, rd: true }, { settleCycles: 26, keepCycles: 4, ppc: 2000, probes: ["uo"] });
  cmp("实验4 积分-微分", "方波（串 1k）峰峰值", r.meas.uo.vpp, e4.intdiff_square_1k.Uo_pp, "Vpp");
}
// ---- 实验 5
const e5 = ref.exp5;
for (const kind of ["lp", "hp"]) {
  const k = kind === "lp" ? "lpf" : "hpf";
  const tab = e5[kind].table;
  const pts = C.sweep(k, { src: { type: "sin", vpp: 1, f: 1e3 }, Rf: 5858 }, tab.map((r) => r.f), "uo", "ui");
  tab.forEach((r, i) => { if (i % 3 === 0) cmp(`实验5 ${kind === "lp" ? "低通" : "高通"}`, `f=${r.f}Hz Uo`, pts[i].mag, r.Uo, "V"); });
  const dense = C.sweep(k, { src: { type: "sin", vpp: 1, f: 1e3 }, Rf: 5858 }, C.logspace(0, 6, 1201), "uo", "ui");
  const refg = dense[kind === "lp" ? 200 : 862].mag; // 10 Hz / 20 kHz
  const main = e5[kind].settings.find((s) => Math.abs(s.Rf - 5858) < 1);
  cmp(`实验5 ${kind === "lp" ? "低通" : "高通"}`, "截止频率", C.cutoff(dense, refg, kind), main.fc_sim, "Hz");
}
// ---- 实验 P
ref.extra.P.forEach((s, i) => {
  const r = C.steady("gen", { src: { type: "sin", vpp: 1, f: 1e3 }, load50: i === 1 }, { settleCycles: 2, keepCycles: 4, probes: ["o"] });
  cmp("实验P", `${s.mode} 峰峰值`, r.meas.o.vpp, s.Vpp, "Vpp");
});

const secs = (Date.now() - t0) / 1000;
const maxAbs = Math.max(...rows.map((r) => Math.abs(r.err)));
for (const r of rows) console.log(`${r.group.padEnd(12)} ${r.item.padEnd(34)} js=${r.js.toPrecision(5).padStart(10)}  spice=${r.spice.toPrecision(5).padStart(10)}  err=${r.err.toFixed(3)}%`);
console.log(`\n${rows.length} 项，最大相对误差 ${maxAbs.toFixed(3)}%，耗时 ${secs.toFixed(1)} s`);
fs.writeFileSync(path.join(__dirname, "../data/validation.json"),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), settle: settleFull ? "full" : "fast", n: rows.length, maxAbsErr: maxAbs, rows }, null, 1));
