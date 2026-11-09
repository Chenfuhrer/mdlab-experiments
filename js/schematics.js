/* =====================================================================
 * schematics.js — 原理图 SVG 绘制（矢量、可点击探头）
 * 每个 layout(p) 返回 { vb:[w,h], body: svg 字符串, probes:[{node,x,y,label,side}] }
 * ===================================================================== */
(function (root) {
  "use strict";
  const fmtR = (r) => (r >= 1e6 ? +(r / 1e6).toFixed(2) + "MΩ" : r >= 1e3 ? +(r / 1e3).toFixed(r % 1000 ? 2 : 1).replace(/\.0$/, "") + "kΩ" : +r.toFixed(0) + "Ω");
  const fmtC = (c) => (c >= 1e-6 ? +(c * 1e6).toFixed(0) + "μF" : +(c * 1e9).toFixed(0) + "nF");

  // ------------------------------------------------------------ 基本图元
  const L = (pts, cls = "w") => `<polyline class="${cls}" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
  const T = (x, y, s, cls = "lb", anchor = "middle") => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${s}</text>`;
  const dot = (x, y) => `<circle class="dot" cx="${x}" cy="${y}" r="3.2"/>`;
  const term = (x, y) => `<circle class="term" cx="${x}" cy="${y}" r="4.2"/>`;

  /** 两端元件；kind: R / C / VR；opt.lab/opt.val 文字，opt.side 'a'(上/左) 'b'(下/右) */
  function two(kind, x1, y1, x2, y2, lab, val, opt = {}) {
    const hz = y1 === y2;
    const len = hz ? x2 - x1 : y2 - y1;
    const sgn = Math.sign(len);
    const mid = hz ? (x1 + x2) / 2 : (y1 + y2) / 2;
    const half = kind === "C" ? 4.5 : 18;
    let s = "";
    const a = mid - half * sgn, b = mid + half * sgn;
    s += hz ? L([[x1, y1], [a, y1]]) + L([[b, y1], [x2, y1]]) : L([[x1, y1], [x1, a]]) + L([[x1, b], [x1, y2]]);
    if (kind === "R" || kind === "VR") {
      const n = 6, amp = 6.5, pts = [];
      for (let i = 0; i <= n * 2; i++) {
        const u = a + (b - a) * i / (n * 2);
        const off = i === 0 || i === n * 2 ? 0 : (i % 2 ? amp : -amp);
        pts.push(hz ? [u, y1 + off] : [x1 + off, u]);
      }
      s += L(pts, "w part");
      if (kind === "VR") {
        const cx = hz ? mid : x1, cy = hz ? y1 : mid;
        s += `<line class="w part" x1="${cx - 15}" y1="${cy + 13}" x2="${cx + 15}" y2="${cy - 13}" marker-end="url(#arr)"/>`;
      }
    } else if (kind === "C") {
      const w = 13;
      s += hz
        ? `<line class="w part" x1="${a}" y1="${y1 - w}" x2="${a}" y2="${y1 + w}"/><line class="w part" x1="${b}" y1="${y1 - w}" x2="${b}" y2="${y1 + w}"/>`
        : `<line class="w part" x1="${x1 - w}" y1="${a}" x2="${x1 + w}" y2="${a}"/><line class="w part" x1="${x1 - w}" y1="${b}" x2="${x1 + w}" y2="${b}"/>`;
    }
    const side = opt.side || "a";
    if (hz) {
      const dy = kind === "C" ? 20 : 15;
      if (side === "a") { s += T(mid, y1 - dy, lab, "lb") + T(mid, y1 + dy + 11, val, "val"); }
      else { s += T(mid, y1 + dy + 11, `${lab}&#8194;${val}`, "lb2"); }
    } else {
      const dx = kind === "C" ? 19 : 13;
      if (side === "a") { s += T(x1 - dx, mid - 2, lab, "lb", "end") + T(x1 - dx, mid + 13, val, "val", "end"); }
      else { s += T(x1 + dx, mid - 2, lab, "lb", "start") + T(x1 + dx, mid + 13, val, "val", "start"); }
    }
    return s;
  }
  const R = (...a) => two("R", ...a), C = (...a) => two("C", ...a), VR = (...a) => two("VR", ...a);

  function gnd(x, y, up = false) {
    const d = up ? -1 : 1;
    return L([[x, y], [x, y + 8 * d]]) +
      `<line class="w" x1="${x - 11}" y1="${y + 8 * d}" x2="${x + 11}" y2="${y + 8 * d}"/>` +
      `<line class="w" x1="${x - 7}" y1="${y + 12.5 * d}" x2="${x + 7}" y2="${y + 12.5 * d}"/>` +
      `<line class="w" x1="${x - 3}" y1="${y + 17 * d}" x2="${x + 3}" y2="${y + 17 * d}"/>`;
  }
  function vsrc(x, y1, y2, lab) {
    const m = (y1 + y2) / 2, r = 15;
    return L([[x, y1], [x, m - r]]) + L([[x, m + r], [x, y2]]) +
      `<circle class="w part" cx="${x}" cy="${m}" r="${r}"/>` +
      `<path class="w part" d="M${x - 9},${m} C${x - 5},${m - 11} ${x - 1},${m - 11} ${x},${m} S${x + 5},${m + 11} ${x + 9},${m}"/>` +
      T(x - 22, m + 4, lab, "lb", "end");
  }
  /** NPN：基极引脚 (bx,by)；返回 svg 与引脚 */
  function npn(bx, by, lab) {
    const x = bx + 34;
    const s =
      `<circle class="w part" cx="${bx + 24}" cy="${by}" r="21"/>` +
      L([[bx, by], [bx + 15, by]]) +
      `<line class="w part" x1="${bx + 15}" y1="${by - 13}" x2="${bx + 15}" y2="${by + 13}" style="stroke-width:3"/>` +
      L([[bx + 15, by - 6], [x, by - 21], [x, by - 36]]) +
      `<line class="w" x1="${bx + 15}" y1="${by + 6}" x2="${x}" y2="${by + 21}" marker-end="url(#arr)"/>` +
      L([[x, by + 21], [x, by + 36]]) +
      T(bx + 50, by - 2, lab[0], "lb", "start") + T(bx + 50, by + 13, lab[1], "val", "start");
    return { s, C: [x, by - 36], E: [x, by + 36] };
  }
  /** 运放：中心 (cx,cy)；plusTop=true 时同相端在上 */
  function opamp(cx, cy, plusTop = false, name = "LM358") {
    const tri = `<polygon class="w part oa" points="${cx - 36},${cy - 40} ${cx - 36},${cy + 40} ${cx + 40},${cy}"/>`;
    const top = [cx - 52, cy - 18], bot = [cx - 52, cy + 18], out = [cx + 56, cy];
    const s = tri +
      L([top, [cx - 36, cy - 18]]) + L([bot, [cx - 36, cy + 18]]) + L([[cx + 40, cy], out]) +
      T(cx - 27, cy - 13, plusTop ? "+" : "−", "pm") + T(cx - 27, cy + 23, plusTop ? "−" : "+", "pm") +
      L([[cx, cy - 21], [cx, cy - 33]]) + T(cx, cy - 37, "+12V", "rail") +
      L([[cx, cy + 21], [cx, cy + 33]]) + T(cx, cy + 45, "−12V", "rail") +
      T(cx + 3, cy + 4, name, "chip");
    return { s, plus: plusTop ? top : bot, minus: plusTop ? bot : top, out };
  }

  // ------------------------------------------------------------ 电路版图
  const LAY = {};

  LAY.ce = (p) => {
    const yb = 200, yv = 40, yg = 410;
    let s = "";
    s += L([[200, yv], [520, yv]]) + T(528, yv + 4, "V<tspan class='sub'>CC</tspan> = +12 V", "lb", "start");
    s += L([[60, yg], [600, yg]]);
    s += vsrc(60, yg, yb, "U<tspan class='sub'>s</tspan>");
    s += R(60, yb, 150, yb, "R1", "5.1kΩ");
    if (p.R2 !== false) s += R(150, yb, 150, yg, "R2", "51Ω", { side: "a" }) + dot(150, yg);
    s += dot(150, yb);
    s += C(150, yb, 220, yb, "C1", "10μF");
    s += R(220, yv, 220, yb, "R3", fmtR(p.R3 || 100e3), { side: "a" }) + dot(220, yv);
    s += R(220, yb, 220, yg, "R5", fmtR(p.R5 || 24e3), { side: "b" }) + dot(220, yb) + dot(220, yg);
    const q = npn(280, yb, ["Q1", "2N5551"]);
    s += L([[220, yb], [280, yb]]) + q.s;
    const xc = q.C[0];
    s += L([q.C, [xc, 150]]) + R(xc, yv, xc, 150, "R4", fmtR(p.R4 || 5.1e3), { side: "a" }) + dot(xc, yv) + dot(xc, 150);
    s += L([[xc, 150], [380, 150]]) + C(380, 150, 450, 150, "C2", "10μF") + L([[450, 150], [590, 150]]) + term(590, 150);
    const ye = 258, ye2 = 330;
    s += L([q.E, [xc, ye]]) + dot(xc, ye);
    s += R(xc, ye, xc, ye2, "R6", "100Ω", { side: "a" }) + dot(xc, ye2);
    s += R(xc, ye2, xc, yg, "R7", "1.8kΩ", { side: "a" }) + dot(xc, yg);
    const yc3 = p.bypass === "R7" ? ye2 : ye;
    s += L([[xc, yc3], [390, yc3]]) + C(390, yc3, 450, yc3, "C3", "10μF") + L([[450, yc3], [470, yc3], [470, yg]]) + dot(470, yg);
    const rlOn = !!p.RL;
    s += `<g class="${rlOn ? "" : "ghost"}">` + R(540, 150, 540, yg, "R<tspan class='sub'>L</tspan>", rlOn ? fmtR(p.RL) : "未接", { side: "b" }) + dot(540, 150) + dot(540, yg) + `</g>`;
    s += gnd(510, yg) + dot(510, yg) + term(600, yg) + T(600, yg + 20, "d", "node");
    s += T(212, yb - 8, "a", "node") + T(212, yg + 18, "b", "node") + T(596, 140, "c", "node");
    return {
      vb: [680, 450], body: s,
      probes: [
        { node: "us", x: 60, y: yb, label: "Us" }, { node: "ui", x: 150, y: yb, label: "Ui" },
        { node: "a", x: 220, y: yb, label: "a(B)" }, { node: "c", x: xc, y: 150, label: "C" },
        { node: "e", x: xc, y: ye, label: "E" }, { node: "o", x: 590, y: 150, label: "Uo" }, { node: "vcc", x: 200, y: yv, label: "VCC" },
      ],
    };
  };

  LAY.gen = (p) => {
    let s = "";
    s += `<rect class="box" x="30" y="40" width="190" height="200" rx="10"/>` + T(125, 62, "函数信号发生器", "boxt");
    s += vsrc(80, 210, 110, "e<tspan class='sub'>s</tspan>") + L([[80, 110], [100, 110]]) + R(100, 110, 200, 110, "R<tspan class='sub'>o</tspan>", "50Ω") + L([[200, 110], [260, 110]]) + term(220, 110);
    s += L([[80, 210], [260, 210]]) + term(220, 210);
    s += T(125, 232, p.load50 ? "负载设置：50 Ω（误设）" : "负载设置：高阻 High Z", "val");
    s += `<rect class="box" x="330" y="40" width="200" height="200" rx="10"/>` + T(430, 62, "示波器 CH1 输入", "boxt");
    s += L([[260, 110], [380, 110]]) + R(380, 110, 380, 210, "1MΩ", "", { side: "b" }) + C(470, 110, 470, 210, "16pF", "", { side: "b" });
    s += L([[380, 110], [470, 110]]) + L([[260, 210], [470, 210]]) + dot(380, 110) + dot(380, 210) + gnd(300, 210);
    return { vb: [560, 270], body: s, probes: [{ node: "o", x: 300, y: 110, label: "探头" }, { node: "g", x: 80, y: 110, label: "es" }] };
  };

  function supplyNote() { return ""; }

  LAY.follower = (p) => {
    const o = opamp(300, 150, true);
    let s = o.s;
    s += L([[60, o.plus[1]], o.plus]) + term(60, o.plus[1]);
    s += L([o.minus, [o.minus[0] - 18, o.minus[1]], [o.minus[0] - 18, 240], [420, 240], [420, 150]]);
    s += L([o.out, [520, 150]]) + dot(420, 150) + term(520, 150);
    s += `<g class="${p.RL ? "" : "ghost"}">` + R(470, 150, 470, 230, "R<tspan class='sub'>L</tspan>", p.RL ? fmtR(p.RL) : "未接", { side: "b" }) + gnd(470, 230) + dot(470, 150) + `</g>`;
    return { vb: [580, 290], body: s, probes: [{ node: "ui", x: 60, y: o.plus[1], label: "Ui" }, { node: "uo", x: 520, y: 150, label: "Uo" }] };
  };

  function invBase(o, s, inputs, fb, p, extra = {}) {
    // inputs: [{node, y, el:'R'|'C', lab, val}]，反相端节点 n 位于 (nx, ny)
    const nx = o.minus[0] - 40, ny = o.minus[1];
    s += L([[nx, ny], o.minus]) + dot(nx, ny);
    inputs.forEach((inp, i) => {
      const y = inp.y;
      const x0 = 50, x1 = nx - 100, x2 = nx - 20;
      s += term(x0, y) + L([[x0, y], [x1, y]]) + two(inp.el || "R", x1, y, x2, y, inp.lab, inp.val) + L([[x2, y], [nx, y]]);
      if (y !== ny) s += L([[nx, y], [nx, ny]]) + dot(nx, y);
    });
    const xo = o.out[0] + 34;
    s += L([o.out, [xo + 120, o.out[1]]]) + dot(xo, o.out[1]) + term(xo + 120, o.out[1]);
    // 反馈支路（可多条并联）
    const ytop = Math.min(...inputs.map((q) => q.y), ny);
    fb.forEach((f, i) => {
      const yf = ytop - 72 - i * 62;
      s += L([[nx, ytop], [nx, yf]]) + two(f.el, nx + 20 + (o.out[0] - nx - 40) / 2 - 40, yf, nx + 20 + (o.out[0] - nx - 40) / 2 + 40, yf, f.lab, f.val);
      s += L([[nx, yf], [nx + 20 + (o.out[0] - nx - 40) / 2 - 40, yf]]) + L([[nx + 20 + (o.out[0] - nx - 40) / 2 + 40, yf], [xo, yf], [xo, o.out[1]]]);
      if (i > 0) s += dot(nx, yf + 62) + dot(xo, yf + 62);
    });
    // 同相端接地电阻
    const px = o.plus[0] - 26;
    s += L([o.plus, [px, o.plus[1]]]) + R(px, o.plus[1], px, o.plus[1] + 72, extra.r1lab || "R1", extra.r1val || "10kΩ", { side: "a" }) + gnd(px, o.plus[1] + 72);
    return { s, xo };
  }

  LAY.inverting = (p) => {
    const o = opamp(330, 175);
    let { s, xo } = invBase(o, o.s, [{ y: o.minus[1], lab: "R2", val: "10kΩ" }], [{ el: "R", lab: "R<tspan class='sub'>F</tspan>", val: "100kΩ" }], p);
    s += `<g class="${p.RL ? "" : "ghost"}">` + R(xo + 60, o.out[1], xo + 60, o.out[1] + 80, "R<tspan class='sub'>L</tspan>", p.RL ? fmtR(p.RL) : "未接", { side: "b" }) + gnd(xo + 60, o.out[1] + 80) + dot(xo + 60, o.out[1]) + `</g>`;
    return { vb: [600, 300], body: s, probes: [{ node: "ui", x: 50, y: o.minus[1], label: "Ui" }, { node: "n", x: o.minus[0] - 40, y: o.minus[1], label: "u−" }, { node: "uo", x: xo + 120, y: o.out[1], label: "Uo" }] };
  };
  LAY.suminv = (p) => {
    const o = opamp(360, 200);
    const { s, xo } = invBase(o, o.s, [{ y: o.minus[1], lab: "R2", val: "10kΩ" }, { y: o.minus[1] - 62, lab: "R3", val: "10kΩ" }],
      [{ el: "R", lab: "R<tspan class='sub'>F</tspan>", val: "100kΩ" }], p);
    return {
      vb: [620, 320], body: s,
      probes: [{ node: "u1", x: 50, y: o.minus[1], label: "Ui1" }, { node: "u2", x: 50, y: o.minus[1] - 62, label: "Ui2" }, { node: "uo", x: xo + 120, y: o.out[1], label: "Uo" }],
    };
  };
  LAY.integrator = (p) => {
    const o = opamp(330, 215);
    const fb = [{ el: "C", lab: "C1", val: "100nF" }];
    if (p.rpar) fb.push({ el: "R", lab: "R3", val: "100kΩ" });
    const { s, xo } = invBase(o, o.s, [{ y: o.minus[1], lab: "R2", val: "10kΩ" }], fb, p);
    return { vb: [600, 330], body: s + (p.vos ? T(590, 318, `运放失调 Vos = ${(p.vos * 1e3).toFixed(1)} mV`, "val", "end") : ""),
      probes: [{ node: "ui", x: 50, y: o.minus[1], label: "Ui" }, { node: "uo", x: xo + 120, y: o.out[1], label: "Uo" }] };
  };
  LAY.differentiator = (p) => {
    const o = opamp(330, 175);
    const { s, xo } = invBase(o, o.s, [{ y: o.minus[1], el: "C", lab: "C1", val: "220nF" }], [{ el: "R", lab: "R<tspan class='sub'>f</tspan>", val: "10kΩ" }], p);
    return { vb: [600, 290], body: s, probes: [{ node: "ui", x: 50, y: o.minus[1], label: "Ui" }, { node: "uo", x: xo + 120, y: o.out[1], label: "Uo" }] };
  };
  LAY.noninv = (p) => {
    const o = opamp(330, 130, true);
    let s = o.s;
    s += term(50, o.plus[1]) + L([[50, o.plus[1]], [120, o.plus[1]]]) + R(120, o.plus[1], 210, o.plus[1], "R1", "10kΩ") + L([[210, o.plus[1]], o.plus]);
    const nx = o.minus[0] - 30, ny = o.minus[1];
    s += L([o.minus, [nx, ny]]) + dot(nx, ny);
    s += L([[nx, ny], [nx - 50, ny]]) + R(nx - 50, ny, nx - 50, ny + 80, "R2", "10kΩ", { side: "a" }) + gnd(nx - 50, ny + 80);
    const xo = o.out[0] + 34;
    s += L([o.out, [xo + 120, o.out[1]]]) + dot(xo, o.out[1]) + term(xo + 120, o.out[1]);
    const yf = ny + 95;
    s += L([[nx, ny], [nx, yf], [nx + 40, yf]]) + R(nx + 40, yf, nx + 140, yf, "R<tspan class='sub'>F</tspan>", "100kΩ", { side: "b" }) + L([[nx + 140, yf], [xo, yf], [xo, o.out[1]]]);
    s += `<g class="${p.RL ? "" : "ghost"}">` + R(xo + 60, o.out[1], xo + 60, o.out[1] - 75, "R<tspan class='sub'>L</tspan>", p.RL ? fmtR(p.RL) : "未接", { side: "b" }) + gnd(xo + 60, o.out[1] - 75, true) + dot(xo + 60, o.out[1]) + `</g>`;
    return { vb: [600, 300], body: s, probes: [{ node: "ui", x: 50, y: o.plus[1], label: "Ui" }, { node: "n", x: nx, y: ny, label: "u−" }, { node: "uo", x: xo + 120, y: o.out[1], label: "Uo" }] };
  };
  LAY.addsub = (p) => {
    const o = opamp(360, 150, true);
    let s = o.s;
    const px = o.plus[0] - 34;
    s += term(50, o.plus[1]) + L([[50, o.plus[1]], [100, o.plus[1]]]) + R(100, o.plus[1], 190, o.plus[1], "R2", "10kΩ") + L([[190, o.plus[1]], o.plus]) + dot(px, o.plus[1]);
    s += R(px, o.plus[1], px, o.plus[1] - 75, "R1", fmtR(p.R1 || 10e3), { side: "a" }) + gnd(px, o.plus[1] - 75, true);
    const nx = o.minus[0] - 34, ny = o.minus[1];
    s += term(50, ny) + L([[50, ny], [170, ny]]) + R(170, ny, 260, ny, "R3", "10kΩ", { side: "b" }) + L([[260, ny], o.minus]) + dot(nx, ny);
    const xo = o.out[0] + 34;
    s += L([o.out, [xo + 110, o.out[1]]]) + dot(xo, o.out[1]) + term(xo + 110, o.out[1]);
    const yf = ny + 92;
    s += L([[nx, ny], [nx, yf], [nx + 40, yf]]) + R(nx + 40, yf, nx + 140, yf, "R<tspan class='sub'>F</tspan>", "100kΩ", { side: "b" }) + L([[nx + 140, yf], [xo, yf], [xo, o.out[1]]]);
    return { vb: [600, 310], body: s, probes: [{ node: "u1", x: 50, y: o.plus[1], label: "Ui1" }, { node: "u2", x: 50, y: ny, label: "Ui2" }, { node: "p", x: px, y: o.plus[1], label: "u+" }, { node: "uo", x: xo + 110, y: o.out[1], label: "Uo" }] };
  };
  LAY.intdiff = (p) => {
    const o1 = opamp(260, 215), o2 = opamp(640, 215);
    let s = o1.s + o2.s;
    const n1 = o1.minus[0] - 36, y = o1.minus[1];
    s += term(40, y) + L([[40, y], [90, y]]) + R(90, y, 170, y, "R2", "10kΩ") + L([[170, y], o1.minus]) + dot(n1, y);
    const xo1 = o1.out[0] + 26;
    s += L([o1.out, [xo1, o1.out[1]]]) + dot(xo1, o1.out[1]);
    const yc = y - 72, yr = y - 134, mx = (n1 + xo1) / 2;
    s += L([[n1, y], [n1, yr]]) + L([[n1, yc], [mx - 4.5, yc]]) + C(mx - 30, yc, mx + 30, yc, "C1", "100nF") + L([[mx + 4.5, yc], [xo1, yc]]);
    s += L([[n1, yr], [mx - 40, yr]]) + R(mx - 40, yr, mx + 40, yr, "R3", "100kΩ") + L([[mx + 40, yr], [xo1, yr], [xo1, o1.out[1]]]) + dot(n1, yc) + dot(xo1, yc);
    s += L([o1.plus, [o1.plus[0] - 26, o1.plus[1]]]) + R(o1.plus[0] - 26, o1.plus[1], o1.plus[0] - 26, o1.plus[1] + 72, "R1", "10kΩ") + gnd(o1.plus[0] - 26, o1.plus[1] + 72);
    // 第二级
    const n2 = o2.minus[0] - 36;
    let xs = xo1;
    if (p.rd) { s += R(xo1, o1.out[1], xo1 + 90, o1.out[1], "R<tspan class='sub'>d</tspan>", "1kΩ", { side: "b" }); xs = xo1 + 90; }
    s += L([[xs, o1.out[1]], [xs + 20, o1.out[1]]]) + C(xs + 20, o1.out[1], xs + 80, o1.out[1], "C2", "220nF", { side: "b" });
    s += L([[xs + 80, o1.out[1]], [n2, o1.out[1]], [n2, o2.minus[1]], o2.minus]) + dot(n2, o2.minus[1]);
    const xo2 = o2.out[0] + 30;
    s += L([o2.out, [xo2 + 90, o2.out[1]]]) + dot(xo2, o2.out[1]) + term(xo2 + 90, o2.out[1]);
    s += L([[n2, o2.minus[1]], [n2, yc], [(n2 + xo2) / 2 - 40, yc]]) + R((n2 + xo2) / 2 - 40, yc, (n2 + xo2) / 2 + 40, yc, "R5", "10kΩ") + L([[(n2 + xo2) / 2 + 40, yc], [xo2, yc], [xo2, o2.out[1]]]);
    s += L([o2.plus, [o2.plus[0] - 26, o2.plus[1]]]) + R(o2.plus[0] - 26, o2.plus[1], o2.plus[0] - 26, o2.plus[1] + 72, "R4", "10kΩ") + gnd(o2.plus[0] - 26, o2.plus[1] + 72);
    return { vb: [830, 340], body: s, probes: [{ node: "ui", x: 40, y, label: "Ui" }, { node: "u1", x: xo1, y: o1.out[1], label: "Uo1" }, { node: "uo", x: xo2 + 90, y: o2.out[1], label: "Uo" }] };
  };

  function sallen(p, hp) {
    const o = opamp(470, 175, true);
    let s = o.s;
    const y = o.plus[1], x = 190, pn = 340;
    const el = hp ? "C" : "R";
    s += term(40, y) + L([[40, y], [80, y]]) + two(el, 80, y, 160, y, hp ? "C1" : "R3", hp ? "100nF" : "10kΩ", { side: "b" }) + L([[160, y], [x, y]]);
    s += L([[x, y], [x + 30, y]]) + two(el, x + 30, y, x + 110, y, hp ? "C2" : "R2", hp ? "100nF" : "10kΩ", { side: "b" }) + L([[x + 110, y], o.plus]) + dot(x, y) + dot(pn, y);
    s += two(hp ? "R" : "C", pn, y, pn, y - 70, hp ? "R2" : "C2", hp ? "10kΩ" : "10nF", { side: "b" }) + gnd(pn, y - 70, true);
    const xo = o.out[0] + 34, yt = 40;
    s += two(hp ? "R" : "C", x, y, x, yt + 50, hp ? "R1" : "C1", hp ? "10kΩ" : "10nF", { side: "a" }) + L([[x, yt + 50], [x, yt], [xo, yt], [xo, o.out[1]]]);
    s += L([o.out, [xo + 100, o.out[1]]]) + dot(xo, o.out[1]) + term(xo + 100, o.out[1]);
    const nx = o.minus[0] - 22, ny = o.minus[1];
    s += L([o.minus, [nx, ny]]) + dot(nx, ny) + L([[nx, ny], [nx - 40, ny]]) + R(nx - 40, ny, nx - 40, ny + 75, hp ? "R3" : "R1", "10kΩ", { side: "a" }) + gnd(nx - 40, ny + 75);
    const yf = ny + 92;
    s += L([[nx, ny], [nx, yf], [nx + 30, yf]]) + VR(nx + 30, yf, nx + 120, yf, "R<tspan class='sub'>f</tspan>", fmtR(p.Rf), { side: "b" }) + L([[nx + 120, yf], [xo, yf], [xo, o.out[1]]]);
    return { vb: [720, 320], body: s, probes: [{ node: "ui", x: 40, y, label: "Ui" }, { node: "p", x: pn, y, label: "u+" }, { node: "uo", x: xo + 100, y: o.out[1], label: "Uo" }] };
  }
  LAY.lpf = (p) => sallen(p, false);
  LAY.hpf = (p) => sallen(p, true);

  /** 渲染到容器；assign = {node: ['ch1','ch2','dmm']}；onProbe(node) 点击回调 */
  function render(el, kind, p, assign, onProbe) {
    const lay = LAY[kind](p);
    const [w, h] = lay.vb;
    const tags = { ch1: "1", ch2: "2", dmm: "V" };
    const probes = lay.probes.map((pr) => {
      const roles = assign[pr.node] || [];
      const ring = roles.map((r, i) => `<circle class="ring ${r}" cx="${pr.x}" cy="${pr.y}" r="${9 + i * 4}"/>`).join("");
      const flags = roles.map((r, i) => `<g class="flag ${r}" transform="translate(${pr.x + 8 + i * 17},${pr.y - 28})"><rect width="15" height="15" rx="3"/><text x="7.5" y="11.5" text-anchor="middle">${tags[r]}</text></g>`).join("");
      return `<g class="probe ${roles.length ? "on" : ""}" data-node="${pr.node}" tabindex="0" role="button" aria-label="探头点 ${pr.label}">
        <circle class="hit" cx="${pr.x}" cy="${pr.y}" r="15"/>${ring}<circle class="pin" cx="${pr.x}" cy="${pr.y}" r="5"/>
        <text class="ptag" x="${pr.x}" y="${pr.y + 30}" text-anchor="middle">${pr.label}</text>${flags}</g>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="sch" role="img" aria-label="电路原理图">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrh"/></marker></defs>
      ${lay.body}${probes}</svg>`;
    el.querySelectorAll(".probe").forEach((g) => {
      const fire = () => onProbe && onProbe(g.dataset.node);
      g.addEventListener("click", fire);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
    });
    return lay;
  }

  root.Schematics = { render, LAY, fmtR, fmtC };
})(typeof window !== "undefined" ? window : globalThis);
