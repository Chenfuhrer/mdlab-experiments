/* =====================================================================
 * engine.js — 浏览器端电路仿真引擎（改进节点分析法 MNA）
 *   · 直流工作点：Newton-Raphson + pn 结电压限幅 + 电源步进兜底
 *   · 瞬态分析：定步长 BDF2（Gear-2），首步/失败重试用后向欧拉
 *   · 交流小信号：在工作点线性化，实数 2N 形式求解复数方程
 *   · 器件：R、C、独立电压源（DC/正弦/方波）、二极管、Gummel-Poon BJT、LM358 行为级宏模型
 * 模型参数与 ngspice 校验网表（spice/models.lib）完全一致。
 * ===================================================================== */
(function (root) {
  "use strict";
  const K_BOLTZ = 1.380649e-23, Q_E = 1.602176634e-19;
  const VT = K_BOLTZ * 300.15 / Q_E;          // 27 °C
  const GMIN = 1e-12;

  // ---------------------------------------------------------------- 器件模型
  const Q2N5551 = { IS: 2.511e-15, BF: 242.6, NF: 1, VAF: 100, IKF: 0.3458, ISE: 2.511e-15, NE: 1.249,
                    BR: 3.197, NR: 1, ISC: 0, NC: 2, IKR: 0, RB: 10, RC: 1 };
  const LM358 = { gm: 4.398e-4, imax: 30e-6, c1: 100e-12, r1: 227.4e6, rin: 10e6, rcm: 1e9,
                  vcc: 12, vee: -12, dropHi: 1.5, dropLo: 0.8, dIS: 1e-14, rp2: 1e3, cp2: 53e-12, ro: 50 };

  function safeExp(x) {            // 防溢出：超过 80 后线性外推
    if (x > 80) { const e = Math.exp(80); return [e * (1 + x - 80), e]; }
    const e = Math.exp(x); return [e, e];
  }
  function pnjlim(vnew, vold, vt, vcrit) {
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) {
        const arg = 1 + (vnew - vold) / vt;
        vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
      } else {
        vnew = vt * Math.log(vnew / vt);
      }
    }
    return vnew;
  }

  // ---------------------------------------------------------------- 信号波形
  function waveValue(w, t) {
    if (!w) return 0;
    let v = w.dc || 0;
    if (w.type === "sin") {
      v += w.amp * Math.sin(2 * Math.PI * w.f * t + (w.phase || 0) * Math.PI / 180);
    } else if (w.type === "square") {
      // 方波：从 +amp 开始，delay 内保持 +amp；有限边沿 tr
      const T = 1 / w.f, tr = w.tr || 1e-8, d = w.delay || 0;
      if (t < d) return v + w.amp;
      let tt = (t - d) % T;
      const half = T / 2;
      let s;
      if (tt < tr) s = 1 - 2 * tt / tr;                       // +→-
      else if (tt < half) s = -1;
      else if (tt < half + tr) s = -1 + 2 * (tt - half) / tr; // -→+
      else s = 1;
      v += w.amp * s;
    }
    return v;
  }

  // ---------------------------------------------------------------- Circuit
  class Circuit {
    constructor() {
      this.nodes = new Map([["0", -1]]);
      this.nodeNames = [];
      this.devs = [];
      this.vsrc = [];
    }
    n(name) {
      name = String(name);
      if (name === "0" || name === "gnd") return -1;
      if (!this.nodes.has(name)) { this.nodes.set(name, this.nodeNames.length); this.nodeNames.push(name); }
      return this.nodes.get(name);
    }
    internal(prefix) { return this.n(prefix + "#" + this.nodeNames.length); }
    R(name, a, b, r) { this.devs.push({ kind: "R", name, a: this.n(a), b: this.n(b), g: 1 / r }); return this; }
    C(name, a, b, c, ic) { this.devs.push({ kind: "C", name, a: this.n(a), b: this.n(b), c, ic }); return this; }
    V(name, a, b, wave, ac = 0) {
      const d = { kind: "V", name, a: this.n(a), b: this.n(b), wave, ac };
      this.devs.push(d); this.vsrc.push(d); return this;
    }
    D(name, a, b, IS, N = 1, vshift = 0) { this.devs.push({ kind: "D", name, a: this.n(a), b: this.n(b), IS, N, vshift, vd: 0 }); return this; }
    Q(name, c, b, e, m = Q2N5551) {
      const C = this.n(c), B = this.n(b), E = this.n(e);
      const bi = m.RB > 0 ? this.internal(name + ".b") : B;
      const ci = m.RC > 0 ? this.internal(name + ".c") : C;
      if (m.RB > 0) this.devs.push({ kind: "R", name: name + ".rb", a: B, b: bi, g: 1 / m.RB });
      if (m.RC > 0) this.devs.push({ kind: "R", name: name + ".rc", a: C, b: ci, g: 1 / m.RC });
      this.devs.push({ kind: "Q", name, c: ci, b: bi, e: E, m, vbe: 0.6, vbc: -5, op: null });
      return this;
    }
    /** LM358 宏模型：p 同相、n 反相、o 输出；opt.vos 失调电压 */
    OA(name, p, n, o, opt = {}) {
      const m = Object.assign({}, LM358, opt);
      const P = this.n(p), N = this.n(n), O = this.n(o);
      const n1 = this.internal(name + ".n1"), n2 = this.internal(name + ".n2");
      this.devs.push({ kind: "R", name: name + ".rin", a: P, b: N, g: 1 / m.rin });
      this.devs.push({ kind: "R", name: name + ".rcmp", a: P, b: -1, g: 1 / m.rcm });
      this.devs.push({ kind: "R", name: name + ".rcmn", a: N, b: -1, g: 1 / m.rcm });
      this.devs.push({ kind: "GM", name: name + ".gm", p: P, nn: N, out: n1, gm: m.gm, imax: m.imax, vos: m.vos || 0 });
      this.devs.push({ kind: "R", name: name + ".r1", a: n1, b: -1, g: 1 / m.r1 });
      this.devs.push({ kind: "C", name: name + ".c1", a: n1, b: -1, c: m.c1, ic: 0 });
      const vh = m.vcc - m.dropHi - 0.565, vl = m.vee + m.dropLo + 0.565;
      this.devs.push({ kind: "D", name: name + ".dhi", a: n1, b: -1, IS: m.dIS, N: 1, vshift: -vh, vd: 0 });
      this.devs.push({ kind: "D", name: name + ".dlo", a: -1, b: n1, IS: m.dIS, N: 1, vshift: vl, vd: 0 });
      this.devs.push({ kind: "BUF", name: name + ".p2", from: n1, to: n2, g: 1 / m.rp2 });
      this.devs.push({ kind: "C", name: name + ".cp2", a: n2, b: -1, c: m.cp2, ic: 0 });
      this.devs.push({ kind: "BUF", name: name + ".out", from: n2, to: O, g: 1 / m.ro });
      return this;
    }
    finalize() {
      this.N = this.nodeNames.length;
      this.vsrc.forEach((v, i) => (v.k = this.N + i));
      this.size = this.N + this.vsrc.length;
      return this;
    }
  }

  // ---------------------------------------------------------------- 线性代数
  function luSolve(A, b, n) {           // 原地 LU（部分主元），返回解向量；奇异时返回 null
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
      if (mx < 1e-300) return null;
      piv[k] = p;
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = b[k]; b[k] = b[p]; b[p] = t;
      }
      const akk = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / akk;
        if (f === 0) continue;
        A[i * n + k] = f;
        for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
        b[i] -= f * b[k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
      x[i] = s / A[i * n + i];
    }
    return x;
  }

  // ---------------------------------------------------------------- 求解器
  class Solver {
    constructor(ckt) {
      this.ckt = ckt.finalize ? ckt.finalize() : ckt;
      const n = this.ckt.size;
      this.n = n;
      this.A = new Float64Array(n * n);
      this.b = new Float64Array(n);
      this.x = new Float64Array(n);
      this.t = 0;
      this.srcScale = 1;
      this.stepCount = 0;
    }
    v(x, i) { return i < 0 ? 0 : x[i]; }
    addG(a, b, g) {
      const A = this.A, n = this.n;
      if (a >= 0) A[a * n + a] += g;
      if (b >= 0) A[b * n + b] += g;
      if (a >= 0 && b >= 0) { A[a * n + b] -= g; A[b * n + a] -= g; }
    }
    addI(a, b, i) { if (a >= 0) this.b[a] -= i; if (b >= 0) this.b[b] += i; } // 电流 i 从 a 经器件流向 b
    /** 非线性电流 I（从节点 k 流出进入器件），对节点电压偏导 parts=[[node,dI/dv],...] */
    addNL(k, I0, parts, x) {
      if (k < 0) return;
      const A = this.A, n = this.n;
      let rhs = -I0;
      for (const [j, g] of parts) { if (j >= 0) { A[k * n + j] += g; rhs += g * x[j]; } }
      this.b[k] += rhs;
    }

    load(x, mode) {
      this.A.fill(0); this.b.fill(0);
      const h = this.h, t = this.t;
      for (const d of this.ckt.devs) {
        switch (d.kind) {
          case "R": this.addG(d.a, d.b, d.g); break;
          case "C": {
            if (mode === "dc") { this.addG(d.a, d.b, GMIN); break; }
            let geq, ieq;
            if (this.useBE || d.v2 === undefined) { geq = d.c / h; ieq = geq * d.v1; }
            else { geq = 1.5 * d.c / h; ieq = d.c * (2 * d.v1 - 0.5 * d.v2) / h; }
            d.geq = geq;
            this.addG(d.a, d.b, geq);
            this.addI(d.a, d.b, -ieq);
            break;
          }
          case "V": {
            const k = d.k, n = this.n, A = this.A;
            if (d.a >= 0) { A[d.a * n + k] += 1; A[k * n + d.a] += 1; }
            if (d.b >= 0) { A[d.b * n + k] -= 1; A[k * n + d.b] -= 1; }
            this.b[k] = waveValue(d.wave, mode === "dc" ? 0 : t) * this.srcScale;
            break;
          }
          case "D": {
            const nvt = d.N * VT;
            let vd = this.v(x, d.a) - this.v(x, d.b) + d.vshift;
            const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * d.IS));
            const vdRaw = vd;
            vd = pnjlim(vd, d.vd, nvt, vcrit);
            if (Math.abs(vd - vdRaw) > 1e-9) this.limited = true;
            d.vd = vd;
            const [e, de] = safeExp(vd / nvt);
            const I = d.IS * (e - 1) + GMIN * vd, g = d.IS * de / nvt + GMIN;
            // 线性化：I ≈ I0 + g (vd' - vd)，vd' = va - vb + vshift
            const Ieq = I - g * (vd - d.vshift);
            this.addG(d.a, d.b, g);
            this.addI(d.a, d.b, Ieq);
            d.g = g;
            break;
          }
          case "GM": {
            const vd = this.v(x, d.p) - this.v(x, d.nn) + d.vos;
            const th = Math.tanh(d.gm * vd / d.imax);
            const I = d.imax * th, g = d.gm * (1 - th * th);
            d.g = g;
            // 电流注入 out 节点（从 out 流出的电流为 -I）
            this.addNL(d.out, -I, [[d.p, -g], [d.nn, g]], x);
            break;
          }
          case "BUF": { // 电流 g·(v_from - v_to) 注入 to 节点（理想缓冲器 + 串联电阻）
            const A = this.A, n = this.n;
            if (d.to >= 0) { A[d.to * n + d.to] += d.g; if (d.from >= 0) A[d.to * n + d.from] -= d.g; }
            break;
          }
          case "Q": this.loadBJT(d, x); break;
        }
      }
    }

    loadBJT(d, x) {
      const m = d.m;
      const vb = this.v(x, d.b), vc = this.v(x, d.c), ve = this.v(x, d.e);
      const vcrit = VT * Math.log(VT / (Math.SQRT2 * m.IS));
      const vbe = pnjlim(vb - ve, d.vbe, VT, vcrit);
      const vbc = pnjlim(vb - vc, d.vbc, VT, vcrit);
      if (Math.abs(vbe - (vb - ve)) > 1e-9 || Math.abs(vbc - (vb - vc)) > 1e-9) this.limited = true;
      d.vbe = vbe; d.vbc = vbc;
      const [ebe, debe] = safeExp(vbe / (m.NF * VT));
      const [ebc, debc] = safeExp(vbc / (m.NR * VT));
      const If = m.IS * (ebe - 1), dIf = m.IS * debe / (m.NF * VT);
      const Ir = m.IS * (ebc - 1), dIr = m.IS * debc / (m.NR * VT);
      const [ele, dele] = safeExp(vbe / (m.NE * VT));
      const ILE = m.ISE * (ele - 1), dILE = m.ISE * dele / (m.NE * VT);
      // 基区电荷 qb（Early 效应 + 大注入）
      const q1 = 1 / (1 - vbc / m.VAF);
      const dq1dbc = q1 * q1 / m.VAF;
      const q2 = m.IKF > 0 ? If / m.IKF : 0;
      const dq2dbe = m.IKF > 0 ? dIf / m.IKF : 0;
      const s = Math.sqrt(Math.max(1 + 4 * q2, 1e-12));
      const qb = q1 * (1 + s) / 2;
      const dqbdbe = q1 / s * dq2dbe;
      const dqbdbc = dq1dbc * (1 + s) / 2;
      const It = (If - Ir) / qb;
      const IC = It - Ir / m.BR;
      const IB = If / m.BF + ILE + Ir / m.BR;
      const gcbe = (dIf * qb - (If - Ir) * dqbdbe) / (qb * qb);
      const gcbc = (-dIr * qb - (If - Ir) * dqbdbc) / (qb * qb) - dIr / m.BR;
      const gbbe = dIf / m.BF + dILE + GMIN;
      const gbbc = dIr / m.BR + GMIN;
      d.op = { IC, IB, vbe, vbc, gm: gcbe, gpi: gbbe, go: -gcbc - gbbc * 0, gmu: gbbc, gcbc };
      // 线性化：I ≈ I0 + gbe (Vbe - vbe0) + gbc (Vbc - vbc0)，Vbe = vb-ve，Vbc = vb-vc
      const ic0 = IC + GMIN * 0, ib0 = IB + GMIN * vbe + GMIN * vbc;
      const B = d.b, Cn = d.c, E = d.e;
      // 用"等效线性化值"写入：I0' = I0 - gbe*vbe0 - gbc*vbc0
      const icEq = ic0 - gcbe * vbe - gcbc * vbc;
      const ibEq = ib0 - gbbe * vbe - gbbc * vbc;
      const n = this.n, A = this.A, rhs = this.b;
      const stampRow = (row, Ieq, gbe, gbc, sign) => {
        if (row < 0) return;
        // 从 row 流入器件的电流 = sign * (Ieq + gbe(vb-ve) + gbc(vb-vc))
        if (B >= 0) A[row * n + B] += sign * (gbe + gbc);
        if (E >= 0) A[row * n + E] -= sign * gbe;
        if (Cn >= 0) A[row * n + Cn] -= sign * gbc;
        rhs[row] -= sign * Ieq;
      };
      stampRow(Cn, icEq, gcbe, gcbc, 1);
      stampRow(B, ibEq, gbbe, gbbc, 1);
      stampRow(E, icEq + ibEq, gcbe + gbbe, gcbc + gbbc, -1);
    }

    newton(mode, maxIter = 120) {
      let x = this.x;
      for (let it = 0; it < maxIter; it++) {
        this.limited = false;
        this.load(x, mode);
        const xn = luSolve(this.A.slice(), this.b.slice(), this.n);
        if (!xn) return false;
        let ok = true;
        for (let i = 0; i < this.n; i++) {
          const tol = 1e-4 * Math.max(Math.abs(xn[i]), Math.abs(x[i])) + (i < this.ckt.N ? 1e-6 : 1e-11);
          if (!(Math.abs(xn[i] - x[i]) <= tol)) { ok = false; break; }
        }
        x = xn;
        if (ok && it > 0 && !this.limited) { this.x = x; return true; }
      }
      this.x = x;
      return false;
    }

    /** 直流工作点 */
    op() {
      this.x.fill(0);
      if (this.newton("dc")) { this.afterOP(); return true; }
      // 电源步进
      this.x.fill(0);
      for (const d of this.ckt.devs) { if (d.kind === "Q") { d.vbe = 0.6; d.vbc = -5; } if (d.kind === "D") d.vd = 0; }
      for (const s of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
        this.srcScale = s;
        if (!this.newton("dc", 200)) { this.srcScale = 1; return false; }
      }
      this.srcScale = 1;
      this.afterOP();
      return true;
    }
    afterOP() {
      for (const d of this.ckt.devs) if (d.kind === "C") { d.v1 = this.v(this.x, d.a) - this.v(this.x, d.b); d.v2 = undefined; }
    }
    /** 用电容初值起步（相当于 ngspice 的 uic） */
    uic() {
      this.x.fill(0);
      for (const d of this.ckt.devs) if (d.kind === "C") { d.v1 = d.ic || 0; d.v2 = undefined; }
      // 初始化电压源节点：做一次 t=0 的"电容视为电压源"近似——直接从 0 起步即可
    }

    /** 推进一个时间步 h；返回是否收敛 */
    step(h) {
      if (this.lastH && Math.abs(h - this.lastH) > 1e-15) this.forceBE = true;   // 步长变化：本步用后向欧拉
      this.lastH = h;
      this.h = h;
      const t0 = this.t, x0 = this.x.slice();
      this.t = t0 + h;
      this.useBE = this.stepCount === 0 || this.forceBE;
      if (this.useBE) for (const d of this.ckt.devs) if (d.kind === "C") d.v2 = undefined;
      if (!this.newton("tran", 60)) {
        // 失败：退回并用 4 个后向欧拉子步
        this.t = t0; this.x = x0;
        for (const d of this.ckt.devs) if (d.kind === "C") d.v2 = undefined;
        for (let k = 0; k < 4; k++) {
          this.h = h / 4; this.t += h / 4; this.useBE = true;
          if (!this.newton("tran", 200)) return false;
          this.commit(true);
        }
        this.h = h; this.forceBE = true;
        return true;
      }
      this.commit(false);
      this.forceBE = false;
      return true;
    }
    commit(beOnly) {
      for (const d of this.ckt.devs) if (d.kind === "C") {
        d.v2 = beOnly ? undefined : d.v1;
        d.v1 = this.v(this.x, d.a) - this.v(this.x, d.b);
      }
      this.stepCount++;
    }
    node(name) { const i = this.ckt.nodes.get(String(name)); return i === undefined || i < 0 ? 0 : this.x[i]; }

    /** 瞬态：从当前状态推进 duration，记录 probes；返回 {t, [probe]: Float64Array} */
    run(duration, h, probes, recordFrom = 0) {
      const nsteps = Math.round(duration / h);
      const nrec = Math.max(0, nsteps - Math.round(recordFrom / h));
      const out = { t: new Float64Array(nrec) };
      const idx = probes.map((p) => this.ckt.nodes.get(String(p)));
      probes.forEach((p) => (out[p] = new Float64Array(nrec)));
      let r = 0;
      for (let s = 0; s < nsteps; s++) {
        if (!this.step(h)) throw new Error("瞬态不收敛 t=" + this.t);
        if (s >= nsteps - nrec) {
          out.t[r] = this.t;
          probes.forEach((p, k) => (out[p][r] = idx[k] === undefined || idx[k] < 0 ? 0 : this.x[idx[k]]));
          r++;
        }
      }
      return out;
    }

    /** 交流小信号分析：返回 {f, [probe]: {re, im}[]} */
    ac(freqs, probes) {
      const n = this.n, N2 = 2 * n;
      const G = new Float64Array(n * n), Cm = new Float64Array(n * n), bR = new Float64Array(n);
      const add = (M, a, b, g) => {
        if (a >= 0) M[a * n + a] += g; if (b >= 0) M[b * n + b] += g;
        if (a >= 0 && b >= 0) { M[a * n + b] -= g; M[b * n + a] -= g; }
      };
      const x = this.x;
      for (const d of this.ckt.devs) {
        switch (d.kind) {
          case "R": add(G, d.a, d.b, d.g); break;
          case "C": add(Cm, d.a, d.b, d.c); break;
          case "D": add(G, d.a, d.b, d.g || GMIN); break;
          case "V": {
            const k = d.k;
            if (d.a >= 0) { G[d.a * n + k] += 1; G[k * n + d.a] += 1; }
            if (d.b >= 0) { G[d.b * n + k] -= 1; G[k * n + d.b] -= 1; }
            bR[k] = d.ac || 0;
            break;
          }
          case "GM": {
            const o = d.out, g = d.g;
            if (o >= 0) { if (d.p >= 0) G[o * n + d.p] -= g; if (d.nn >= 0) G[o * n + d.nn] += g; }
            break;
          }
          case "BUF": if (d.to >= 0) { G[d.to * n + d.to] += d.g; if (d.from >= 0) G[d.to * n + d.from] -= d.g; } break;
          case "Q": {
            const o = d.op, B = d.b, Cn = d.c, E = d.e;
            const rows = [[Cn, o.gm, o.gcbc, 1], [B, o.gpi, o.gmu, 1], [E, o.gm + o.gpi, o.gcbc + o.gmu, -1]];
            for (const [row, gbe, gbc, sg] of rows) {
              if (row < 0) continue;
              if (B >= 0) G[row * n + B] += sg * (gbe + gbc);
              if (E >= 0) G[row * n + E] -= sg * gbe;
              if (Cn >= 0) G[row * n + Cn] -= sg * gbc;
            }
            break;
          }
        }
      }
      const idx = probes.map((p) => this.ckt.nodes.get(String(p)));
      const res = { f: freqs };
      probes.forEach((p) => (res[p] = []));
      for (const f of freqs) {
        const w = 2 * Math.PI * f;
        const M = new Float64Array(N2 * N2), rhs = new Float64Array(N2);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const g = G[i * n + j], c = w * Cm[i * n + j];
          M[i * N2 + j] = g; M[(i + n) * N2 + j + n] = g;
          M[i * N2 + j + n] = -c; M[(i + n) * N2 + j] = c;
        }
        for (let i = 0; i < n; i++) rhs[i] = bR[i];
        const sol = luSolve(M, rhs, N2);
        probes.forEach((p, k) => {
          const i = idx[k];
          res[p].push(i === undefined || i < 0 ? { re: 0, im: 0 } : { re: sol[i], im: sol[i + n] });
        });
      }
      return res;
    }
  }

  // ---------------------------------------------------------------- 测量工具
  /** 对整数个周期的均匀采样做 DFT：返回 vpp、dc、a1（基波幅值）、ph1（相位，度，sin 参考）、thd(%) */
  function measureTone(t, y, f, ncyc) {
    const n = y.length;
    const dt = t[1] - t[0];
    const T = 1 / f;
    let m = ncyc ? Math.round(ncyc * T / dt) : n;
    m = Math.min(m, n);
    const off = n - m;
    let mx = -Infinity, mn = Infinity, sum = 0;
    for (let i = off; i < n; i++) { const v = y[i]; if (v > mx) mx = v; if (v < mn) mn = v; sum += v; }
    const dc = sum / m;
    const harm = [];
    for (let k = 1; k <= 10; k++) {
      let s = 0, c = 0;
      const w = 2 * Math.PI * k * f;
      for (let i = off; i < n; i++) { const ph = w * t[i]; s += (y[i] - dc) * Math.sin(ph); c += (y[i] - dc) * Math.cos(ph); }
      harm.push({ a: 2 * Math.hypot(s, c) / m, ph: Math.atan2(c, s) * 180 / Math.PI });
    }
    const a1 = harm[0].a;
    let hs = 0; for (let k = 1; k < 10; k++) hs += harm[k].a * harm[k].a;
    return { vpp: mx - mn, vmax: mx, vmin: mn, dc, a1, ph1: harm[0].ph, thd: a1 > 0 ? 100 * Math.sqrt(hs) / a1 : NaN };
  }
  function phaseDiff(mo, mi) { let d = mo.ph1 - mi.ph1; d = ((d + 180) % 360 + 360) % 360 - 180; if (Math.abs(d + 180) < 1e-9) d = 180; return d; }

  const API = { VT, Q2N5551, LM358, Circuit, Solver, waveValue, measureTone, phaseDiff };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.AnalogSim = API;
})(typeof window !== "undefined" ? window : globalThis);
