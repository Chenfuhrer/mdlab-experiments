/* =====================================================================
 * experiments.js — 6 个实验的实验台配置与数据表（教案表号一致）
 * 表格中的数值由 Circuits.* 在浏览器里实时计算；ref() 取 ngspice 参考值用于对照
 * ===================================================================== */
(function (root) {
  "use strict";
  const C = root.Circuits;
  const REF = root.REF || {};
  const sin = (vpp, f, phase = 0) => ({ type: "sin", vpp, f, phase });
  const R3Q = { 偏大: 53668.8, 合适: 84523.5, 偏小: 380080.5 };   // ngspice 二分法求得，使 a 点 ≈ 3.5 / 2.5 / 0.7 V

  // ------------------------------------------------------------ 测量函数
  function ceDyn(p, extraProbes = []) {
    const r = C.steady("ce", p, { settleCycles: 40, settlePpc: 80, keepCycles: 5, probes: ["us", "ui", "a", "o", ...extraProbes] });
    const m = r.meas, ph = C.phaseDiff(m.o, m.ui);
    return { m, ph, au: m.o.vpp / m.ui.vpp * (Math.abs(ph) > 90 ? -1 : 1) };
  }
  function oaDyn(kind, p, nodes = ["ui", "uo"], opt = {}) {
    return C.steady(kind, p, Object.assign({ settleCycles: 4, keepCycles: 4, ppc: 500, probes: nodes }, opt)).meas;
  }
  const signed = (m) => (Math.cos(m.ph1 * Math.PI / 180) >= 0 ? 1 : -1) * m.vpp;

  // ------------------------------------------------------------ 公共控件
  const fCtl = (min, max, presets) => ({ type: "range", key: "src.f", label: "频率", unit: "Hz", min, max, log: true, presets });
  const vCtl = (min, max, label = "幅度 Us", presets) => ({ type: "range", key: "src.vpp", label, unit: "Vpp", min, max, log: true, presets });

  const EXP = {};

  // ================================================================ 实验 P
  EXP.p = {
    no: "P", title: "元器件识别与仪器使用", tag: "仪器",
    lead: "先学会用工具：信号源怎么设、示波器怎么读、万用表怎么量。",
    circuits: [{ id: "gen", name: "信号源 → 示波器" }],
    defaults: { circuit: "gen", src: sin(1, 1000), load50: false },
    probes: { ch1: "o", ch2: null, dmm: "o" },
    ppc: 400,
    controls: [
      { type: "seg", key: "src.type", label: "波形", options: [["sin", "正弦"], ["square", "方波"]] },
      fCtl(10, 1e5, [100, 1000, 10000]),
      vCtl(0.01, 10, "幅度（面板显示值）", [0.1, 1, 2]),
      { type: "seg", key: "load50", label: "输出阻抗设置", options: [[false, "高阻 High Z"], [true, "50 Ω"]], rebuild: true },
    ],
    tasks: [
      "保持“高阻”，设 1 kHz、1 Vpp 正弦，读示波器上的周期、频率、峰峰值（对应表 P-3）。",
      "把输出阻抗改成 50 Ω，观察读数为什么变成 2 倍。",
      "切到方波，观察示波器触发与时基如何自动适配。",
    ],
    tables: [
      {
        id: "P-1", title: "用数字万用表测试实验箱直流电压输出",
        cols: ["实验箱直流电压", "+12", "−12", "+8", "−8", "+5", "−5"],
        static: [["标称值 / V", "12.00", "−12.00", "8.00", "−8.00", "5.00", "−5.00"]],
        inputRow: "我的实测 / V",
        note: "实验箱电源是实物硬件，仿真无法替代。请在实验室用万用表直流 20 V 档实测，填在“我的实测”一行（保存在本机浏览器里）。",
      },
      {
        id: "P-2", title: "示波器基准信号观测",
        cols: ["项目", "标准值", "说明"],
        static: [["观察到的波形", "方波", "探头补偿端输出"], ["频率 / kHz", "1（典型）", "以面板丝印为准［待核对］"], ["峰峰值 / Vpp", "见面板", "以面板丝印为准［待核对］"]],
        inputRow: "我的实测",
        note: "校准信号的标准值取决于示波器型号，网站无法替你核对；实验时读面板丝印，并用“自动测量”记录实测值。",
      },
      {
        id: "P-3", title: "设置信号发生器输出正弦信号并观测（f = 1 kHz，Upp = 1 V）",
        cols: ["信号源设置", "周期 / ms", "频率 / kHz", "峰峰值 / V"],
        rows: [
          { label: "输出阻抗：高阻 High Z", bench: { load50: false, src: sin(1, 1000) }, refv: () => REF.extra && [REF.extra.P[0].T_ms, REF.extra.P[0].f_kHz, REF.extra.P[0].Vpp] },
          { label: "输出阻抗：50 Ω（误设）", bench: { load50: true, src: sin(1, 1000) }, refv: () => REF.extra && [REF.extra.P[1].T_ms, REF.extra.P[1].f_kHz, REF.extra.P[1].Vpp] },
        ],
        run: (row) => {
          const m = oaDyn("gen", { src: sin(1, 1000), load50: row.bench.load50 }, ["o"], { ppc: 400, settleCycles: 2 });
          return [1, 1, m.o.vpp].map((v, i) => (i === 2 ? v : v));
        },
        fmt: [3, 3, 3],
        note: "仿真条件：信号源内阻 50 Ω，示波器输入 1 MΩ ∥ 16 pF。",
      },
    ],
  };

  // ================================================================ 实验 1
  const ce1 = { "1-1": {}, "1-2": { R4: 9e3 }, "1-3": { R5: 15e3 }, "1-4": { bypass: "R7" } };
  EXP["1"] = {
    no: "1", title: "单级共射放大电路（I）", tag: "BJT",
    lead: "基极上 10 mV 的小信号，到集电极变成 1.4 V，而且方向相反。",
    circuits: [{ id: "ce", name: "共射放大电路" }],
    defaults: { circuit: "ce", src: sin(1, 1e4), R3: 100e3, R4: 5.1e3, R5: 24e3, bypass: "full", R2: true, RL: null },
    probes: { ch1: "ui", ch2: "o", dmm: "c" },
    ppc: 400,
    bode: { out: "o", in: "ui", fmin: 1, fmax: 1e6, db: true, unit: "|Au| / dB" },
    presets: [
      { name: "图 1-1 初始", p: { R4: 5.1e3, R5: 24e3, bypass: "full" } },
      { name: "图 1-2 R4 = 9k", p: { R4: 9e3, R5: 24e3, bypass: "full" } },
      { name: "图 1-3 R5 = 15k", p: { R4: 5.1e3, R5: 15e3, bypass: "full" } },
      { name: "图 1-4 C3 只旁路 R7", p: { R4: 5.1e3, R5: 24e3, bypass: "R7" } },
    ],
    controls: [
      vCtl(0.05, 4, "信号源 Us", [1, 1.5, 2]),
      fCtl(20, 2e5, [1000, 10000]),
      { type: "range", key: "R4", label: "集电极电阻 R4", unit: "Ω", min: 1e3, max: 15e3, log: true, rebuild: true, presets: [5100, 9000] },
      { type: "range", key: "R5", label: "下偏置电阻 R5", unit: "Ω", min: 5e3, max: 60e3, log: true, rebuild: true, presets: [15000, 24000] },
      { type: "seg", key: "bypass", label: "旁路电容 C3", options: [["full", "旁路 R6+R7"], ["R7", "只旁路 R7"]], rebuild: true },
    ],
    tasks: [
      "先不加信号（Us 拉到最小），把万用表依次点到 a(B)、E、C，记录静态电位（表 1-1）。",
      "Us = 1 Vpp、10 kHz：CH1 看 Ui、CH2 看 Uo，读 Au 与相位差（表 1-2）。",
      "依次点上方的图 1-2、1-3、1-4 预设，比较 Au 与波形的变化（表 1-3、1-4）。",
      "把频率拉到 1 kHz，看扫频仪上标记点为什么落在下降沿上。",
    ],
    tables: [
      {
        id: "1-1", title: "电路静态工作点的计算及测量",
        cols: ["", "U<sub>B</sub>/V", "U<sub>C</sub>/V", "U<sub>E</sub>/V", "U<sub>BEQ</sub>/V", "U<sub>CEQ</sub>/V", "I<sub>C</sub>/mA", "I<sub>E</sub>/mA"],
        rows: [{ label: "仿真测量", bench: { R4: 5.1e3, R5: 24e3, bypass: "full", src: sin(0.05, 1e4) },
          refv: () => { const s = REF.exp12.exp1.static["1-1"]; return [s.UB, s.UC, s.UE, s.UBEQ, s.UCEQ, s.IC, s.IE]; } }],
        run: () => {
          const o = C.dcop("ce", Object.assign({ src: sin(0, 1e4) }, ce1["1-1"]));
          const UB = o.v("a"), UC = o.v("c"), UE = o.v("e");
          return [UB, UC, UE, UB - UE, UC - UE, (12 - UC) / 5.1, UE / 1.9];
        },
        fmt: [2, 2, 2, 3, 2, 3, 3],
        note: "计算值：U<sub>BEQ</sub> = U<sub>B</sub> − U<sub>E</sub>，U<sub>CEQ</sub> = U<sub>C</sub> − U<sub>E</sub>，I<sub>C</sub> = (V<sub>CC</sub> − U<sub>C</sub>)/R<sub>4</sub>，I<sub>E</sub> = U<sub>E</sub>/(R<sub>6</sub>+R<sub>7</sub>)。",
      },
      {
        id: "1-2", title: "共射极放大电路动态参数（图 1-1，10 kHz）",
        cols: ["U<sub>s</sub> / Vpp", "U<sub>i</sub> / mVpp", "U<sub>o</sub> / Vpp", "A<sub>u</sub>", "相位差", "THD / %"],
        rows: [1, 1.5, 2].map((us, i) => ({ label: us.toFixed(1), bench: { R4: 5.1e3, R5: 24e3, bypass: "full", src: sin(us, 1e4) },
          refv: () => { const s = REF.exp12.exp1.dyn["1-1"][i]; return [s.Ui * 1e3, s.Uo, s.Au, s.phase, s.thd]; } })),
        run: (row) => { const r = ceDyn(Object.assign({}, ce1["1-1"], row.bench)); return [r.m.ui.vpp * 1e3, r.m.o.vpp, r.au, r.ph, r.m.o.thd]; },
        fmt: [2, 3, 1, 1, 1],
        note: "U<sub>i</sub> 与 U<sub>o</sub> 反相（相位差约 −177°，即 ≈180°）。U<sub>s</sub> 增大时 THD 上升、|A<sub>u</sub>| 略降，来自 i<sub>C</sub> 与 u<sub>BE</sub> 的指数关系。",
      },
      {
        id: "1-3", title: "改变集电极电阻 R4 和 R5 后电路动态参数",
        cols: ["U<sub>s</sub> / Vpp", "R5=24k，R4=9k：U<sub>o</sub>", "A<sub>u</sub>", "R5=15k，R4=5.1k：U<sub>o</sub>", "A<sub>u</sub>"],
        rows: [1, 1.5, 2].map((us, i) => ({ label: us.toFixed(1), bench: { R4: 9e3, R5: 24e3, bypass: "full", src: sin(us, 1e4) },
          refv: () => { const a = REF.exp12.exp1.dyn["1-2"][i], b = REF.exp12.exp1.dyn["1-3"][i]; return [a.Uo, a.Au, b.Uo, b.Au]; } })),
        run: (row) => {
          const a = ceDyn(Object.assign({}, ce1["1-2"], { src: row.bench.src }));
          const b = ceDyn(Object.assign({}, ce1["1-3"], { src: row.bench.src }));
          return [a.m.o.vpp, a.au, b.m.o.vpp, b.au];
        },
        fmt: [3, 1, 3, 1],
        note: "R4 增大 → |A<sub>u</sub>| 按比例增大，但 U<sub>CEQ</sub> 只剩约 3.4 V；R5 减小 → I<sub>C</sub> 降到 0.44 mA，g<sub>m</sub> 变小，|A<sub>u</sub>| 降到约 84。",
      },
      {
        id: "1-4", title: "改变旁路电容位置后电路动态参数（图 1-4）",
        cols: ["U<sub>s</sub> / Vpp", "U<sub>i</sub> / mVpp", "U<sub>o</sub> / Vpp", "A<sub>u</sub>", "THD / %"],
        rows: [1, 1.5, 2].map((us, i) => ({ label: us.toFixed(1), bench: { R4: 5.1e3, R5: 24e3, bypass: "R7", src: sin(us, 1e4) },
          refv: () => { const s = REF.exp12.exp1.dyn["1-4"][i]; return [s.Ui * 1e3, s.Uo, s.Au, s.thd]; } })),
        run: (row) => { const r = ceDyn(Object.assign({}, ce1["1-4"], row.bench)); return [r.m.ui.vpp * 1e3, r.m.o.vpp, r.au, r.m.o.thd]; },
        fmt: [2, 3, 1, 2],
        note: "R6 引入交流负反馈：|A<sub>u</sub>| ≈ R4′/(r<sub>e</sub>+R6) ≈ 37，降为原来的 1/4，THD 从 4.3% 降到 0.3%。",
      },
      {
        id: "1-B", title: "补充：测试频率对 A<sub>u</sub> 的影响（U<sub>s</sub> = 1 Vpp）", extra: true,
        cols: ["测试频率", "图1-1 A<sub>u</sub>", "相位差", "图1-4 A<sub>u</sub>", "相位差"],
        rows: [1e3, 1e4].map((f) => ({ label: f === 1e3 ? "1 kHz" : "10 kHz", bench: { R4: 5.1e3, R5: 24e3, bypass: "full", src: sin(1, f) } })),
        run: (row) => {
          const a = ceDyn(Object.assign({}, ce1["1-1"], { src: row.bench.src }));
          const b = ceDyn(Object.assign({}, ce1["1-4"], { src: row.bench.src }));
          return [a.au, a.ph, b.au, b.ph];
        },
        fmt: [1, 1, 1, 1],
        note: "本电路 f<sub>L</sub> ≈ 480 Hz。1 kHz 时 C3 容抗（16 Ω）与 r<sub>e</sub>（33 Ω）相当，旁路不彻底，所以教案用 10 kHz。",
      },
    ],
  };

  // ================================================================ 实验 2
  EXP["2"] = {
    no: "2", title: "单级共射放大电路（II）", tag: "BJT",
    lead: "把放大器当黑盒：输入像一个电阻，输出像带内阻的电源；Q 点放偏了会削波。",
    circuits: [{ id: "ce", name: "共射放大电路" }],
    defaults: { circuit: "ce", src: sin(1, 1e4), R3: 100e3, R4: 5.1e3, R5: 24e3, bypass: "full", R2: true, RL: null },
    probes: { ch1: "ui", ch2: "o", dmm: "a" },
    ppc: 400,
    presets: [
      { name: "初始电路", p: { R3: 100e3, R2: true, RL: null, src: sin(1, 1e4) } },
      { name: "Q 偏大（a≈3.5 V）", p: { R3: R3Q.偏大, R2: true, RL: null, src: sin(4, 1e4) } },
      { name: "Q 合适（a≈2.5 V）", p: { R3: R3Q.合适, R2: true, RL: null, src: sin(4, 1e4) } },
      { name: "Q 偏小（a≈0.7 V）", p: { R3: R3Q.偏小, R2: true, RL: null, src: sin(4, 1e4) } },
      { name: "测 Ri（去掉 R2）", p: { R3: 100e3, R2: false, RL: null, src: sin(0.06, 1e4) } },
    ],
    controls: [
      vCtl(0.02, 12, "信号源 Us", [0.06, 1, 4, 10]),
      fCtl(20, 2e5, [1000, 10000]),
      { type: "seg", key: "RL", label: "负载 RL", options: [[null, "∞"], [3e3, "3k"], [5.1e3, "5.1k"], [10e3, "10k"]], rebuild: true },
      { type: "range", key: "R3", label: "上偏置 R3（调 Q 点）", unit: "Ω", min: 30e3, max: 600e3, log: true, rebuild: true, presets: [53669, 84524, 100000, 380081] },
      { type: "seg", key: "R2", label: "R2（51 Ω）", options: [[true, "接入"], [false, "去掉（测 Ri）"]], rebuild: true },
    ],
    tasks: [
      "Us = 1 Vpp，切换 RL = ∞ / 3k / 5.1k / 10k，记录 Uo，用 Ro = (Uo∞/UoL − 1)·RL 算输出电阻（表 2-2）。",
      "点“测 Ri”预设：CH1 改点到 Us，CH2 点到 a，读两者峰峰值算 Ri（表 2-3）。",
      "依次点“Q 偏大 / 合适 / 偏小”，万用表看 a 点电位，示波器看哪一边被削平（表 2-4）。",
      "失真预设下波形需要约 0.3 s 仿真时间才完全稳定，可点“快进至稳态”。",
    ],
    tables: [
      Object.assign({}, EXP["1"].tables[0], { id: "2-1", note: "与表 1-1 为同一电路，静态工作点相同。" }),
      {
        id: "2-2", title: "带载电压放大倍数并计算输出电阻（U<sub>s</sub> = 1 Vpp，10 kHz）",
        cols: ["R<sub>L</sub>", "U<sub>i</sub> / mVpp", "U<sub>o</sub> / Vpp", "A<sub>u</sub>", "R<sub>o</sub> / kΩ"],
        rows: [[3e3, "3 kΩ"], [5.1e3, "5.1 kΩ"], [10e3, "10 kΩ"], [null, "∞（空载）"]].map(([RL, lab], i) => ({ label: lab, bench: { RL, R2: true, R3: 100e3, src: sin(1, 1e4) },
          refv: () => { const s = REF.exp12.exp2.RL_rows[i]; return [s.Ui * 1e3, s.Uo, s.Au, s.Ro_k ?? null]; } })),
        run: (row, ctx) => {
          if (!ctx.uoInf) ctx.uoInf = ceDyn({ src: sin(1, 1e4) }).m.o.vpp;
          const r = ceDyn({ src: sin(1, 1e4), RL: row.bench.RL });
          return [r.m.ui.vpp * 1e3, r.m.o.vpp, r.au, row.bench.RL ? (ctx.uoInf / r.m.o.vpp - 1) * row.bench.RL / 1e3 : null];
        },
        fmt: [2, 3, 1, 2],
        note: "三组 R<sub>o</sub> 平均约 4.86 kΩ；理论 R<sub>o</sub> ≈ R4 ∥ r<sub>o</sub> = 4.91 kΩ。",
      },
      {
        id: "2-3", title: "测量输入电阻（图 2-3：去掉 R2，10 kHz）",
        cols: ["U<sub>s</sub> / mVpp", "U<sub>a-b</sub>(U<sub>i</sub>) / mVpp", "U<sub>c-d</sub>(U<sub>o</sub>) / Vpp", "THD / %", "A<sub>u</sub>", "R<sub>i</sub> / kΩ"],
        rows: [0.08, 0.06].map((us, i) => ({ label: (us * 1e3).toFixed(0), bench: { R2: false, RL: null, R3: 100e3, src: sin(us, 1e4) },
          refv: () => { const s = REF.exp12.exp2.Ri_rows[i]; return [s.Ui * 1e3, s.Uo, s.thd, s.Au, s.Ri_k]; } })),
        run: (row) => {
          const r = C.steady("ce", { src: row.bench.src, R2: false }, { settleCycles: 1000, settlePpc: 60, keepCycles: 5, probes: ["us", "a", "o"] }).meas;
          const ph = C.phaseDiff(r.o, r.a);
          return [r.a.vpp * 1e3, r.o.vpp, r.o.thd, r.o.vpp / r.a.vpp * (Math.abs(ph) > 90 ? -1 : 1), r.a.vpp / (r.us.vpp - r.a.vpp) * 5.1];
        },
        fmt: [2, 3, 1, 1, 2],
        note: "R<sub>i</sub> = U<sub>i</sub>·R<sub>1</sub>/(U<sub>s</sub> − U<sub>i</sub>)。小信号理论值 R3∥R5∥r<sub>be</sub> = 3.46 kΩ；80 mV 一组偏大约 5%，是大信号下 r<sub>be</sub> 变化所致。",
      },
      {
        id: "2-4", title: "波形失真观测（U<sub>s</sub> = 4 Vpp，10 kHz，调 R3）",
        cols: ["Q 点", "a 点电位 / V", "R<sub>3</sub> / kΩ", "I<sub>CQ</sub> / mA", "U<sub>CEQ</sub> / V", "u<sub>o</sub> 正峰 / V", "u<sub>o</sub> 负峰 / V", "THD / %", "判断"],
        rows: ["偏大", "合适", "偏小"].map((tag) => ({ label: tag, bench: { R3: R3Q[tag], R2: true, RL: null, src: sin(4, 1e4) },
          refv: () => { const s = REF.exp12.exp2.dist.find((d) => d.tag === tag && d.Us === 4); return [s.UB, s.R3_k, s.IC, s.UCEQ, s.Uo_max, s.Uo_min, s.thd, null]; } })),
        run: (row) => {
          const o = C.dcop("ce", { src: sin(0, 1e4), R3: row.bench.R3 });
          const UB = o.v("a"), UC = o.v("c"), UE = o.v("e");
          const m = C.steady("ce", { src: sin(4, 1e4), R3: row.bench.R3 }, { settleCycles: 3000, settlePpc: 60, keepCycles: 5, probes: ["o"] }).meas.o;
          const judge = row.label === "偏大" ? "底部削平：饱和失真" : row.label === "偏小" ? "顶部压缩：截止失真" : "不削波，负半周略大";
          return [UB, row.bench.R3 / 1e3, (12 - UC) / 5.1, UC - UE, m.vmax, m.vmin, m.thd, judge];
        },
        fmt: [2, 1, 3, 2, 2, 2, 1, null],
        slow: true,
        note: "每行需仿真 0.3 s（约 1–2 秒计算）以等待耦合电容充放电稳定。输出波形请在实验台点对应预设观察。",
      },
    ],
  };

  // ================================================================ 实验 3
  EXP["3"] = {
    no: "3", title: "集成运放的应用——比例、求和电路", tag: "运放",
    lead: "虚短、虚断两条规则，就能写出所有比例和求和电路的公式。",
    circuits: [
      { id: "follower", name: "图3-1 跟随器" }, { id: "inverting", name: "图3-2 反相比例" }, { id: "noninv", name: "图3-3 同相比例" },
      { id: "suminv", name: "图3-4 反相求和" }, { id: "addsub", name: "图3-5 加减运算" },
    ],
    defaults: { circuit: "inverting", src: sin(1, 1000), src2: sin(0.2, 1000), RL: 5.1e3, R1: 10e3 },
    probes: { ch1: "ui", ch2: "uo", dmm: "uo" },
    ppc: 400,
    controls: [
      vCtl(0.01, 4, "输入 Ui（Ui1）", [0.1, 0.3, 1, 1.5, 3]),
      { type: "seg", key: "src.phase", label: "Ui1 相位", options: [[0, "0°"], [180, "180°（负值）"]], when: (p) => p.circuit === "suminv" || p.circuit === "addsub" },
      { type: "range", key: "src2.vpp", label: "输入 Ui2", unit: "Vpp", min: 0.01, max: 3, log: true, presets: [0.2, 0.5, 1.3], when: (p) => p.circuit === "suminv" || p.circuit === "addsub" },
      { type: "seg", key: "src2.phase", label: "Ui2 相位", options: [[0, "0°"], [180, "180°（负值）"]], when: (p) => p.circuit === "suminv" || p.circuit === "addsub" },
      { type: "seg", key: "R1", label: "同相端 R1", options: [[10e3, "10k（教案）"], [100e3, "100k（真减法器）"]], rebuild: true, when: (p) => p.circuit === "addsub" },
      fCtl(10, 1e5, [100, 1000, 10000]),
      { type: "seg", key: "RL", label: "负载 RL", options: [[null, "∞"], [5.1e3, "5.1k"]], rebuild: true, when: (p) => ["follower", "inverting", "noninv"].includes(p.circuit) },
    ],
    tasks: [
      "反相比例：Ui 依次 100 / 300 / 1000 / 1500 mVpp，读 Uo 与相位差（表 3-2）。",
      "把 Ui 拉到 3 Vpp（即“1500 mV 峰值”），观察输出被 LM358 摆幅削顶。",
      "加减运算：Ui1 = 1、Ui2 = 0.5 时读 Uo；再把 R1 改成 100k，看公式如何变成 10(Ui1 − Ui2)。",
      "频率拉到 50 kHz 以上，看反相比例的增益和相位怎样偏离理想值（GBW 限制）。",
    ],
    tables: [
      { id: "3-1", title: "电压跟随器", cols: ["U<sub>i</sub>", "U<sub>o</sub>（R<sub>L</sub>=∞）/ Vpp", "U<sub>o</sub>（R<sub>L</sub>=5.1k）/ Vpp", "相位差"],
        rows: [1, 2].map((v, i) => ({ label: v + " Vpp", bench: { circuit: "follower", src: sin(v, 1000), RL: 5.1e3 },
          refv: () => { const s = REF.exp3.follower[i]; return [s.inf.Uo, s["5k1"].Uo, s["5k1"].phase]; } })),
        run: (row) => { const a = oaDyn("follower", { src: row.bench.src }), b = oaDyn("follower", { src: row.bench.src, RL: 5.1e3 }); return [a.uo.vpp, b.uo.vpp, C.phaseDiff(b.uo, b.ui)]; },
        fmt: [4, 4, 2] },
      { id: "3-2", title: "反相比例放大电路（理论 −10 倍）", cols: ["U<sub>i</sub>", "理论 |U<sub>o</sub>|", "U<sub>o</sub>（∞）/ Vpp", "U<sub>o</sub>（5.1k）/ Vpp", "相位差"],
        rows: [0.1, 0.3, 1, 1.5].map((v, i) => ({ label: (v * 1e3) + " mVpp", bench: { circuit: "inverting", src: sin(v, 1000), RL: 5.1e3 },
          refv: () => { const s = REF.exp3.inverting[i]; return [Math.abs(s.ideal), s.inf.Uo, s["5k1"].Uo, s["5k1"].phase]; } })),
        run: (row) => { const a = oaDyn("inverting", { src: row.bench.src }), b = oaDyn("inverting", { src: row.bench.src, RL: 5.1e3 }); return [10 * row.bench.src.vpp, a.uo.vpp, b.uo.vpp, C.phaseDiff(b.uo, b.ui)]; },
        fmt: [2, 3, 3, 1] },
      { id: "3-3", title: "同相比例放大电路（理论 11 倍）", cols: ["U<sub>i</sub>", "理论 |U<sub>o</sub>|", "U<sub>o</sub>（∞）/ Vpp", "U<sub>o</sub>（5.1k）/ Vpp", "相位差"],
        rows: [0.1, 0.3, 1, 1.5].map((v, i) => ({ label: (v * 1e3) + " mVpp", bench: { circuit: "noninv", src: sin(v, 1000), RL: 5.1e3 },
          refv: () => { const s = REF.exp3.noninv[i]; return [Math.abs(s.ideal), s.inf.Uo, s["5k1"].Uo, s["5k1"].phase]; } })),
        run: (row) => { const a = oaDyn("noninv", { src: row.bench.src }), b = oaDyn("noninv", { src: row.bench.src, RL: 5.1e3 }); return [11 * row.bench.src.vpp, a.uo.vpp, b.uo.vpp, C.phaseDiff(b.uo, b.ui)]; },
        fmt: [2, 3, 3, 1],
        note: "Ui 按峰峰值理解。若 1500 mV 指峰值（3 Vpp），输出需 ±15 V 以上，超过 LM358 摆幅（+10.4 / −11.1 V），会削顶。" },
      { id: "3-4", title: "加减求和运算电路（1 kHz 同频正弦，负号表示反相）", cols: ["电路", "U<sub>i1</sub> / V", "U<sub>i2</sub> / V", "理论 U<sub>o</sub> / V", "仿真 U<sub>o</sub> / V"],
        rows: [["3-4", 0.3, 0.2], ["3-4", -0.3, 0.2], ["3-5", 1, 0.5], ["3-5", 1, 1.3], ["3-5", 0.2, -0.2]].map(([fig, a, b], i) => ({
          label: "图 " + fig, a, b, fig,
          bench: { circuit: fig === "3-4" ? "suminv" : "addsub", R1: 10e3, src: sin(Math.abs(a), 1000, a < 0 ? 180 : 0), src2: sin(Math.abs(b), 1000, b < 0 ? 180 : 0) },
          refv: () => { const s = REF.exp3.sum[i]; return [s.Ui1, s.Ui2, s.ideal, s.Uo]; } })),
        run: (row) => {
          const m = oaDyn(row.bench.circuit, row.bench, ["uo"]);
          const ideal = row.fig === "3-4" ? -10 * (row.a + row.b) : 5.5 * row.a - 10 * row.b;
          return [row.a, row.b, ideal, signed(m.uo)];
        },
        fmt: [2, 2, 2, 3],
        note: "图 3-5 中 R1 = R2，同相端只得到 u<sub>i1</sub>/2，所以 u<sub>o</sub> = 5.5u<sub>i1</sub> − 10u<sub>i2</sub>；取 R1 = 100k 才是 10(u<sub>i1</sub> − u<sub>i2</sub>)。" },
    ],
  };

  // ================================================================ 实验 4
  EXP["4"] = {
    no: "4", title: "集成运放的应用——积分、微分", tag: "运放",
    lead: "电容电流正比于电压变化率：放反馈位置是积分，放输入位置是微分。",
    circuits: [{ id: "integrator", name: "图4-1 积分" }, { id: "differentiator", name: "图4-2 微分" }, { id: "intdiff", name: "图4-3 积分-微分" }],
    defaults: { circuit: "integrator", src: { type: "sin", vpp: 2, f: 100, phase: 90, delay: 2.5e-3 }, rpar: false, vos: 0, rd: false },
    probes: { ch1: "ui", ch2: "uo", dmm: "uo" },
    ppc: 1000,
    uic: (p) => p.circuit === "integrator" && !p.rpar,
    presets: [
      { name: "积分 · 正弦 2 Vpp", p: { circuit: "integrator", src: { type: "sin", vpp: 2, f: 100, phase: 90 }, rpar: false, vos: 0 } },
      { name: "积分 · 方波 2 Vpp", p: { circuit: "integrator", src: { type: "square", vpp: 2, f: 100, delay: 2.5e-3 }, rpar: false, vos: 0 } },
      { name: "微分 · 正弦 1 Vpp", p: { circuit: "differentiator", src: { type: "sin", vpp: 1, f: 100 } } },
      { name: "微分 · 方波 100 mVpp", p: { circuit: "differentiator", src: { type: "square", vpp: 0.1, f: 100, delay: 2.5e-3 } } },
      { name: "积分漂移（Vos = 2 mV）", p: { circuit: "integrator", src: { type: "sin", vpp: 2, f: 100, phase: 90 }, rpar: false, vos: 2e-3 } },
      { name: "积分-微分 · 方波", p: { circuit: "intdiff", src: { type: "square", vpp: 2, f: 100 }, rd: false } },
    ],
    controls: [
      { type: "seg", key: "src.type", label: "波形", options: [["sin", "正弦"], ["square", "方波"]] },
      vCtl(0.02, 6, "幅度 Ui", [0.1, 1, 2]),
      fCtl(5, 5000, [100, 1000]),
      { type: "seg", key: "rpar", label: "C1 并联 100 kΩ", options: [[false, "不并"], [true, "并联"]], rebuild: true, when: (p) => p.circuit === "integrator" },
      { type: "range", key: "vos", label: "运放失调电压 Vos", unit: "V", min: 0, max: 5e-3, presets: [0, 2e-3], rebuild: true, when: (p) => p.circuit === "integrator" },
      { type: "seg", key: "rd", label: "C2 前串 1 kΩ", options: [[false, "不串（教案）"], [true, "串联（实用）"]], rebuild: true, when: (p) => p.circuit === "intdiff" },
    ],
    tasks: [
      "积分 · 正弦：读 Uo 的频率、峰峰值，以及 Uo 超前 Ui 多少度（表 4-1）。",
      "积分 · 方波：输出是什么波形？斜率为什么是 1 V/ms？",
      "点“积分漂移”：万用表（DC）读数会一路上涨，直到运放饱和；再把“C1 并联 100 kΩ”打开对比。",
      "微分 · 方波：CH2 只在边沿出现尖脉冲，脉冲后有衰减振荡。",
      "积分-微分 · 方波：振铃几乎不衰减；把“C2 前串 1 kΩ”打开，振铃消失。",
    ],
    tables: [
      { id: "4-1", title: "积分电路（R = 10 kΩ，C = 100 nF）", cols: ["输入（100 Hz，2 Vpp）", "U<sub>o</sub> 频率 / Hz", "U<sub>o</sub> 峰峰值 / V", "相位（U<sub>o</sub> 相对 U<sub>i</sub>）", "理论峰峰值 / V"],
        rows: [{ label: "正弦", bench: { circuit: "integrator", src: { type: "sin", vpp: 2, f: 100, phase: 90 }, rpar: false, vos: 0 },
          refv: () => { const s = REF.exp4.int_sine; return [s.f_out, s.Uo_pp, s.phase, s.ideal_pp]; } },
               { label: "方波", bench: { circuit: "integrator", src: { type: "square", vpp: 2, f: 100, delay: 2.5e-3 }, rpar: false, vos: 0 },
          refv: () => { const s = REF.exp4.int_square; return [s.f_out, s.Uo_pp, null, s.ideal_pp]; } }],
        run: (row) => {
          const m = C.steady("integrator", row.bench, { uic: true, settleCycles: 2, keepCycles: 4, ppc: 2000, probes: ["ui", "uo"] }).meas;
          const sq = row.bench.src.type === "square";
          return [100, m.uo.vpp, sq ? "三角波" : C.phaseDiff(m.uo, m.ui), sq ? 5 : 2 / (2 * Math.PI * 100 * 1e-3)];
        },
        fmt: [1, 3, 1, 3],
        note: "正弦输出超前 90°；方波积分成三角波，斜率 U<sub>m</sub>/RC = 1 V/ms，半周期 5 ms 变化 5 V。" },
      { id: "4-2", title: "微分电路（R<sub>f</sub> = 10 kΩ，C = 220 nF）", cols: ["输入（100 Hz）", "U<sub>o</sub> 频率 / Hz", "U<sub>o</sub> 峰峰值 / V", "相位 / 波形", "理论"],
        rows: [{ label: "正弦 1 Vpp", bench: { circuit: "differentiator", src: { type: "sin", vpp: 1, f: 100 } },
          refv: () => { const s = REF.exp4.diff_sine; return [s.f_out, s.Uo_pp, s.phase, s.ideal_pp]; } },
               { label: "方波 100 mVpp", bench: { circuit: "differentiator", src: { type: "square", vpp: 0.1, f: 100, delay: 2.5e-3 } },
          refv: () => { const s = REF.exp4.diff_square; return [s.f_out, s.Uo_pp, null, null]; } }],
        run: (row) => {
          const sq = row.bench.src.type === "square";
          const m = C.steady("differentiator", row.bench, { settleCycles: sq ? 1 : 2, keepCycles: 4, ppc: sq ? 50000 : 2000, probes: ["ui", "uo"] }).meas;
          return [100, m.uo.vpp, sq ? "正负尖脉冲 + 振铃" : C.phaseDiff(m.uo, m.ui), sq ? "理想为冲激" : 2 * Math.PI * 100 * 2.2e-3];
        },
        fmt: [1, 2, 1, 3],
        slow: true,
        note: "正弦输出滞后 90°。方波尖脉冲高度强烈依赖信号源边沿与运放压摆率，实测会与仿真有较大出入。" },
      { id: "4-C", title: "补充：积分-微分电路（图 4-3，100 Hz，2 Vpp）", extra: true, cols: ["输入", "U<sub>o</sub> 峰峰值 / V", "U<sub>o</sub> 相位", "说明"],
        rows: [{ label: "正弦", bench: { circuit: "intdiff", src: sin(2, 100), rd: false } },
               { label: "方波（串 1 kΩ）", bench: { circuit: "intdiff", src: { type: "square", vpp: 2, f: 100 }, rd: true } }],
        run: (row) => {
          const m = C.steady("intdiff", row.bench, { settleCycles: 26, keepCycles: 4, ppc: 2000, probes: ["ui", "uo"] }).meas;
          return [m.uo.vpp, row.bench.src.type === "sin" ? C.phaseDiff(m.uo, m.ui) : "—", row.bench.src.type === "sin" ? "两级近似互逆，还原正弦" : "积分成三角波，再微分回方波"];
        },
        fmt: [3, 1, null], slow: true },
    ],
  };

  // ================================================================ 实验 5
  const F_LP = [100, 300, 500, 800, 1e3, 1.2e3, 1.4e3, 1.5e3, 1.6e3, 1.65e3, 1.7e3, 1.75e3, 1.8e3, 2e3, 3e3, 6e3];
  const F_HP = [20, 50, 80, 110, 130, 140, 155, 160, 165, 170, 180, 200, 300, 400, 500, 800];
  function filterTable(kind, F) {
    return {
      id: kind === "lpf" ? "5-1" : "5-2", title: (kind === "lpf" ? "低通" : "高通") + "滤波器测试记录（U<sub>i</sub> = 1 V，R<sub>f</sub> = 5.86 kΩ）", wide: true,
      cols: ["f / Hz", ...F.map((f) => (f >= 1000 ? f / 1000 + "k" : f))],
      rows: [{ label: "U<sub>o</sub> / V", bench: { circuit: kind, Rf: 5858, src: sin(1, kind === "lpf" ? 1000 : 160) },
        refv: () => REF.exp5[kind === "lpf" ? "lp" : "hp"].table.map((r) => r.Uo) }],
      run: () => C.sweep(kind, { src: sin(1, 1000), Rf: 5858 }, F, "uo", "ui").map((p) => p.mag),
      fmt: F.map(() => 3),
      after: () => {
        const pts = C.sweep(kind, { src: sin(1, 1000), Rf: 5858 }, C.logspace(0, 6, 1201), "uo", "ui");
        const ref = kind === "lpf" ? pts[200].mag : pts[862].mag;
        const fc = C.cutoff(pts, ref, kind === "lpf" ? "lp" : "hp");
        return `实测截止频率 f<sub>${kind === "lpf" ? "H" : "L"}</sub> = <b>${fc.toFixed(0)} Hz</b>（通带输出 ${ref.toFixed(3)} V × 0.707 = ${(ref / Math.SQRT2).toFixed(3)} V 处）`;
      },
    };
  }
  EXP["5"] = {
    no: "5", title: "集成运放的应用——有源滤波器", tag: "运放",
    lead: "RC 决定截止频率在哪，增益 K（即 Rf）决定曲线在截止点附近是平是凸。",
    circuits: [{ id: "lpf", name: "图5-1 二阶低通" }, { id: "hpf", name: "图5-2 二阶高通" }],
    defaults: { circuit: "lpf", src: sin(1, 1000), Rf: 5858 },
    probes: { ch1: "ui", ch2: "uo", dmm: "uo" },
    ppc: 400,
    bode: { out: "uo", in: "ui", fmin: 10, fmax: 1e5, db: false, unit: "Uo / V（Ui = 1 V）", cutoff: true },
    presets: [
      { name: "Rf = 0（K=1）", p: { Rf: 0 } }, { name: "Rf = 5k（电位器 50%）", p: { Rf: 5000 } },
      { name: "Rf = 5.86k（Butterworth）", p: { Rf: 5858 } }, { name: "Rf = 10k（K=2）", p: { Rf: 10000 } },
    ],
    controls: [
      { type: "range", key: "Rf", label: "电位器 Rf", unit: "Ω", min: 0, max: 10e3, rebuild: true, presets: [0, 5000, 5858, 10000] },
      fCtl(10, 1e5, [160, 1000, 1600]),
      vCtl(0.05, 4, "输入 Ui", [1]),
    ],
    tasks: [
      "保持 Ui = 1 Vpp，拖动频率，从扫频仪和示波器两处读 Uo，填表 5-1 / 5-2。",
      "在截止频率附近（低通 1.5–1.8 kHz，高通 140–180 Hz）多取几个点，找输出 = 0.707 × 通带输出的位置。",
      "依次点 Rf 的四个预设，观察曲线在截止点附近“凸”起的程度；Rf 接近 20 kΩ（K→3）时电路会自激。",
    ],
    tables: [filterTable("lpf", F_LP), filterTable("hpf", F_HP),
      { id: "5-A", title: "补充：电位器 Rf 对截止频率的影响", extra: true,
        cols: ["R<sub>f</sub>", "K = 1+R<sub>f</sub>/R<sub>1</sub>", "Q = 1/(3−K)", "低通 f<sub>H</sub> / Hz", "高通 f<sub>L</sub> / Hz", "峰值高出通带 / dB"],
        rows: [[0, "0"], [5000, "5 kΩ"], [5858, "5.86 kΩ"], [10000, "10 kΩ"]].map(([Rf, lab]) => ({ label: lab, Rf, bench: { Rf } })),
        run: (row) => {
          const K = 1 + row.Rf / 10e3;
          const lp = C.sweep("lpf", { src: sin(1, 1e3), Rf: row.Rf }, C.logspace(0, 6, 1201), "uo", "ui");
          const hp = C.sweep("hpf", { src: sin(1, 1e3), Rf: row.Rf }, C.logspace(0, 6, 1201), "uo", "ui");
          const peak = Math.max(...lp.map((p) => p.mag));
          return [K, 1 / (3 - K), C.cutoff(lp, lp[200].mag, "lp"), C.cutoff(hp, hp[862].mag, "hp"), 20 * Math.log10(peak / lp[200].mag)];
        },
        fmt: [3, 3, 0, 0, 2] },
    ],
  };

  root.EXP = EXP;
  root.EXP_ORDER = ["p", "1", "2", "3", "4", "5"];
})(typeof window !== "undefined" ? window : globalThis);
