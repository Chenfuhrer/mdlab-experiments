/* 色环电阻读数器（实验 P） */
(function (root) {
  "use strict";
  const COLORS = [
    ["黑", "#1b1b1b", 0], ["棕", "#7a4a26", 1], ["红", "#c8302c", 2], ["橙", "#e5781f", 3], ["黄", "#efc91b", 4],
    ["绿", "#2f8f46", 5], ["蓝", "#2a64c4", 6], ["紫", "#7b4bb5", 7], ["灰", "#8a8a8a", 8], ["白", "#f4f2ec", 9],
  ];
  const MULT = [...COLORS.map(([n, c, d]) => [n, c, Math.pow(10, d)]).slice(0, 7), ["金", "#c9a227", 0.1], ["银", "#b8bcc2", 0.01]];
  const TOL = [["金", "#c9a227", "±5%"], ["银", "#b8bcc2", "±10%"], ["棕", "#7a4a26", "±1%"]];
  const QUIZ = [[5, 1, 0, "51 Ω"], [1, 8, 2, "1.8 kΩ"], [5, 1, 2, "5.1 kΩ"], [1, 0, 3, "10 kΩ"], [2, 4, 3, "24 kΩ"], [1, 0, 4, "100 kΩ"]];
  function fmt(r) { return r >= 1e6 ? +(r / 1e6).toPrecision(3) + " MΩ" : r >= 1e3 ? +(r / 1e3).toPrecision(3) + " kΩ" : +r.toPrecision(3) + " Ω"; }

  root.ColorCode = function (el) {
    if (!el) return;
    const st = { b: [2, 4, 3, 0] };
    function draw() {
      const [a, b, m, t] = st.b;
      const val = (COLORS[a][2] * 10 + COLORS[b][2]) * MULT[m][2];
      const cols = [COLORS[a][1], COLORS[b][1], MULT[m][1], TOL[t][1]];
      const xs = [92, 122, 152, 205];
      el.innerHTML = `
        <div class="cc">
          <svg viewBox="0 0 300 80" class="cc-svg" role="img" aria-label="色环电阻 ${fmt(val)}">
            <line x1="0" y1="40" x2="300" y2="40" stroke="#8d8a82" stroke-width="4"/>
            <rect x="70" y="18" width="160" height="44" rx="20" fill="#d8c39a" stroke="#a88f62"/>
            ${cols.map((c, i) => `<rect x="${xs[i]}" y="18" width="12" height="44" fill="${c}" stroke="rgba(0,0,0,.2)"/>`).join("")}
          </svg>
          <div class="cc-val"><b>${fmt(val)}</b><span>${TOL[t][2]}</span></div>
          <div class="cc-rows">
            ${[["第 1 环", COLORS], ["第 2 环", COLORS], ["乘数", MULT], ["误差", TOL]].map(([lab, set], i) => `
              <div class="cc-row"><span>${lab}</span>${set.map(([n, c], j) => `<button class="sw ${st.b[i] === j ? "on" : ""}" data-i="${i}" data-j="${j}" style="--c:${c}" title="${n}" aria-label="${lab} ${n}">${n}</button>`).join("")}</div>`).join("")}
          </div>
          <div class="cc-quiz">本课程用到的电阻：${QUIZ.map(([a, b, m, n]) => `<button class="ghostbtn" data-q="${a},${b},${m}">${n}</button>`).join("")}</div>
        </div>`;
      el.querySelectorAll(".sw").forEach((s) => s.addEventListener("click", () => { st.b[+s.dataset.i] = +s.dataset.j; draw(); }));
      el.querySelectorAll("[data-q]").forEach((s) => s.addEventListener("click", () => { const [a, b, m] = s.dataset.q.split(",").map(Number); st.b = [a, b, m, 0]; draw(); }));
    }
    draw();
  };
})(window);
