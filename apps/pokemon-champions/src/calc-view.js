// Manual damage calculator. You type the raw stats and pick everything with
// chips: the move type + defender type(s) auto-compute effectiveness, stat stages
// give effective Atk/Def, and STAB/Crit/Weather/Burn are chip toggles. Shows the
// Gen-9 formula and the min–max range from the 16 damage rolls (0.85–1.00).
import { TYPES, TYPE_COLORS } from "./data.js";

const pokeRound = (v) => { const f = Math.floor(v); return v - f > 0.5 ? f + 1 : f; };
const stageMult = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const fmtMult = (v) => (v === 0.25 ? "¼" : v === 0.5 ? "½" : v === 0.75 ? "¾" : String(v));

const MODGROUPS = {
  stab: { label: "STAB", opts: [["None", 1], ["×1.5", 1.5], ["×2 Adapt.", 2]] },
  crit: { label: "Crit", opts: [["No crit", 1], ["Crit ×1.5", 1.5]] },
  weather: { label: "Weather", opts: [["None", 1], ["Boost ×1.5", 1.5], ["Weaken ×0.5", 0.5]] },
  burn: { label: "Burn", opts: [["None", 1], ["Burn ×0.5", 0.5]] },
};

function computeDamage(p) {
  let base = 0;
  if (p.power && p.atk && p.def) {
    base = Math.floor(2 * p.level / 5 + 2);
    base = Math.floor(base * p.power * p.atk / p.def);
    base = Math.floor(base / 50) + 2;
  }
  if (!base || p.type === 0) return { base, rolls: new Array(16).fill(0), min: 0, max: 0 };
  const rolls = [];
  for (let r = 85; r <= 100; r++) {
    let d = base;
    d = pokeRound(d * p.weather);
    d = pokeRound(d * p.crit);
    d = Math.floor(d * r / 100);
    d = pokeRound(d * p.stab);
    d = Math.floor(d * p.type);
    if (p.burn < 1) d = Math.floor(d * p.burn);
    d = pokeRound(d * p.other);
    rolls.push(Math.max(1, d));
  }
  return { base, rolls, min: Math.min(...rolls), max: Math.max(...rolls) };
}

export function initCalcView({ container, data }) {
  const s = {
    level: 50, power: 90, category: "physical",
    atkStat: 150, atkStage: 0, defStat: 100, defStage: 0, hp: 0, other: 1,
    moveType: "", defTypes: [],
    stab: 1.5, crit: 1, weather: 1, burn: 1,
    showFormula: false,
  };

  const typeChips = (attr) => TYPES.map((t) =>
    `<button class="type-chip" data-${attr}="${t}"><span class="type" style="background:${TYPE_COLORS[t]}">${t}</span></button>`).join("");

  const modGroups = Object.entries(MODGROUPS).map(([k, g]) => `<div class="mod-group">
    <span class="mod-label">${g.label}</span>
    <div class="seg mod-seg">${g.opts.map(([n, v]) =>
      `<button class="mod-opt" data-mod="${k}" data-val="${v}">${n}</button>`).join("")}</div>
  </div>`).join("");

  const stage = (which) => `<div class="stage"><button class="stage-btn" data-stage="${which}" data-dir="-1">−</button>` +
    `<span class="stage-val" id="${which}-stage">+0</span><button class="stage-btn" data-stage="${which}" data-dir="1">+</button></div>`;

  container.innerHTML = `<div class="calc">
    <div class="calc-head">
      <h2>Damage calculator</h2>
      <p class="calc-note">Type the stats, pick the types &amp; modifiers with chips. Range = the 16 rolls (0.85–1.00). Champions battles are Level 50.</p>
    </div>
    <div class="calc-grid">
      <div class="calc-form">
        <section class="calc-card">
          <h3>Move</h3>
          <div class="calc-row">
            <label class="ci">Base power<input type="number" data-in="power" min="0" value="${s.power}"></label>
            <div class="ci">Category<div class="seg calc-cat"><button data-cat="physical" class="active">Physical</button><button data-cat="special">Special</button></div></div>
          </div>
          <div class="ci">Move type<div class="type-chips" id="mtype">${typeChips("mtype")}</div></div>
        </section>

        <section class="calc-card">
          <h3>Attacker</h3>
          <div class="calc-row">
            <label class="ci">Level<input type="number" data-in="level" min="1" max="100" value="${s.level}"></label>
            <div class="ci"><span class="lbl-a">Attack</span>
              <div class="stat-stage"><input type="number" data-in="atkStat" min="1" value="${s.atkStat}">${stage("atk")}</div>
              <span class="eff-readout" id="eff-atk"></span></div>
          </div>
        </section>

        <section class="calc-card">
          <h3>Defender</h3>
          <div class="calc-row">
            <div class="ci"><span class="lbl-d">Defense</span>
              <div class="stat-stage"><input type="number" data-in="defStat" min="1" value="${s.defStat}">${stage("def")}</div>
              <span class="eff-readout" id="eff-def"></span></div>
            <label class="ci">Target HP <small>(optional)</small><input type="number" data-in="hp" min="0" value="${s.hp}"></label>
          </div>
          <div class="ci">Defender type(s) <small>up to 2</small><div class="type-chips" id="dtype">${typeChips("dtype")}</div>
            <span class="type-eff" id="type-eff"></span></div>
        </section>

        <section class="calc-card">
          <h3>Modifiers</h3>
          ${modGroups}
          <label class="ci other-row">Other multiplier <small>(item / ability)</small><input type="number" data-in="other" min="0" step="0.05" value="${s.other}"></label>
        </section>
      </div>

      <div class="calc-result-wrap">
        <div class="calc-result">
          <div class="calc-dmg" id="calc-dmg"></div>
          <div class="hp-wrap" id="hp-wrap"></div>
          <div class="calc-pct" id="calc-pct"></div>
        </div>
        <div class="calc-formula" id="calc-formula"></div>
      </div>
    </div>
  </div>`;

  const $ = (sel) => container.querySelector(sel);

  container.addEventListener("input", (e) => {
    const k = e.target.dataset.in;
    if (!k) return;
    s[k] = e.target.value === "" ? 0 : Number(e.target.value);
    render();
  });
  container.addEventListener("click", (e) => {
    const cat = e.target.closest(".calc-cat button");
    if (cat) { s.category = cat.dataset.cat; render(); return; }
    const mt = e.target.closest("[data-mtype]");
    if (mt) { s.moveType = s.moveType === mt.dataset.mtype ? "" : mt.dataset.mtype; render(); return; }
    const dt = e.target.closest("[data-dtype]");
    if (dt) {
      const t = dt.dataset.dtype, i = s.defTypes.indexOf(t);
      if (i >= 0) s.defTypes.splice(i, 1);
      else if (s.defTypes.length < 2) s.defTypes.push(t);
      render(); return;
    }
    const mo = e.target.closest(".mod-opt");
    if (mo) { s[mo.dataset.mod] = Number(mo.dataset.val); render(); return; }
    const st = e.target.closest(".stage-btn");
    if (st) {
      const key = st.dataset.stage === "atk" ? "atkStage" : "defStage";
      s[key] = Math.max(-6, Math.min(6, s[key] + Number(st.dataset.dir)));
      render();
      return;
    }
    if (e.target.closest(".fmono-toggle")) { s.showFormula = !s.showFormula; render(); }
  });

  function typeEff() {
    if (!s.moveType || !s.defTypes.length) return 1;
    return s.defTypes.reduce((e, t) => e * (data.typeChart[s.moveType]?.[t] ?? 1), 1);
  }

  function render() {
    const eff = typeEff();
    const effAtk = Math.floor(s.atkStat * stageMult(s.atkStage));
    const effDef = Math.max(1, Math.floor(s.defStat * stageMult(s.defStage)));
    const r = computeDamage({
      level: s.level, power: s.power, atk: effAtk, def: effDef, type: eff,
      stab: s.stab, crit: s.crit, weather: s.weather, burn: s.burn, other: s.other,
    });

    // selection highlights
    $(".lbl-a").textContent = s.category === "physical" ? "Attack" : "Sp. Atk";
    $(".lbl-d").textContent = s.category === "physical" ? "Defense" : "Sp. Def";
    container.querySelectorAll(".calc-cat button").forEach((b) => b.classList.toggle("active", b.dataset.cat === s.category));
    container.querySelectorAll("[data-mtype]").forEach((b) => b.classList.toggle("on", b.dataset.mtype === s.moveType));
    container.querySelectorAll("[data-dtype]").forEach((b) => b.classList.toggle("on", s.defTypes.includes(b.dataset.dtype)));
    container.querySelectorAll(".mod-opt").forEach((b) => b.classList.toggle("active", Number(b.dataset.val) === s[b.dataset.mod]));
    $("#atk-stage").textContent = (s.atkStage >= 0 ? "+" : "") + s.atkStage;
    $("#def-stage").textContent = (s.defStage >= 0 ? "+" : "") + s.defStage;
    $("#eff-atk").textContent = s.atkStage ? `→ ${effAtk}` : "";
    $("#eff-def").textContent = s.defStage ? `→ ${effDef}` : "";

    // type effectiveness read-out
    const effLabel = eff === 0 ? "Immune ×0" : `×${fmtMult(eff)}`;
    const effClass = eff === 0 ? "imm" : eff > 1 ? "se" : eff < 1 ? "nve" : "neutral";
    $("#type-eff").innerHTML = s.moveType
      ? `Effectiveness <span class="type-eff-badge ${effClass}">${effLabel}</span>`
      : `<span class="muted">pick a move type for effectiveness</span>`;

    const avg = r.max ? Math.round(r.rolls.reduce((a, b) => a + b, 0) / r.rolls.length) : 0;
    const aLbl = s.category === "physical" ? "Atk" : "Sp.Atk";
    const dLbl = s.category === "physical" ? "Def" : "Sp.Def";

    // result hero
    if (r.max === 0) {
      $("#calc-dmg").innerHTML = `<span class="calc-zero">0</span><span class="dmg-lab">no damage</span>`;
      $("#hp-wrap").innerHTML = ""; $("#calc-pct").textContent = "";
    } else {
      $("#calc-dmg").innerHTML = `<span class="dmg-nums">${r.min}<span class="dash">–</span>${r.max}</span>` +
        `<span class="dmg-lab">damage · effective ø ${avg}</span>`;
      if (s.hp > 0) {
        const minPct = Math.min(100, r.min / s.hp * 100);
        const maxPct = Math.min(100, r.max / s.hp * 100);
        $("#hp-wrap").innerHTML = `<div class="hpbar"><i class="hp-range" style="width:${maxPct}%"></i><i class="hp-min" style="width:${minPct}%"></i></div>`;
        const p = (x) => Math.round(x / s.hp * 1000) / 10;
        const hits = Math.ceil(s.hp / r.min);
        const ko = r.min >= s.hp ? "guaranteed OHKO"
          : r.max >= s.hp ? `possible OHKO · guaranteed ${hits}HKO`
            : `${hits}HKO`;
        const remMin = Math.max(0, s.hp - r.max), remMax = Math.max(0, s.hp - r.min);
        $("#calc-pct").innerHTML = `${p(r.min)}% – ${p(r.max)}% of ${s.hp} HP · <b>${ko}</b>` +
          `<span class="calc-remain">Health left after the hit: <b>${remMin} – ${remMax}</b> HP</span>`;
      } else {
        $("#hp-wrap").innerHTML = ""; $("#calc-pct").innerHTML = `<span class="muted">Enter Target HP to see % and remaining health.</span>`;
      }
    }

    // formula: plain-language explanation (+ exact formula behind a toggle)
    const pills = [["Base", r.base, "base"]];
    const add = (l, v) => { if (v !== 1) pills.push([l, "×" + fmtMult(v), v > 1 ? "up" : "down"]); };
    add("STAB", s.stab); add("Type", eff); add("Crit", s.crit);
    add("Weather", s.weather); add("Burn", s.burn); add("Other", s.other);
    pills.push(["random", "×0.85–1.00", "rand"]);

    const words = [];
    if (s.stab !== 1) words.push(`STAB ×${s.stab}`);
    if (eff !== 1) words.push(eff === 0 ? "immune" : eff > 1 ? `super-effective ×${fmtMult(eff)}` : `resisted ×${fmtMult(eff)}`);
    if (s.crit !== 1) words.push("crit ×1.5");
    if (s.weather !== 1) words.push(s.weather > 1 ? "weather ×1.5" : "weather ×0.5");
    if (s.burn !== 1) words.push("burn ×0.5");
    if (s.other !== 1) words.push(`other ×${s.other}`);
    const wordStr = words.length ? words.join(", ") + ", " : "";

    $("#calc-formula").innerHTML = `
      <div class="fpills">${pills.map(([l, v, c]) => `<span class="fpill ${c}"><span class="fpill-l">${l}</span><span class="fpill-v">${v}</span></span>`).join("")}</div>
      <div class="fexplain"><b>Base ${r.base}</b> from Level ${s.level}, ${s.power} power, ${effAtk} ${aLbl} vs ${effDef} ${dLbl}. Then ${wordStr}× the random roll (0.85–1.00) → <b>${r.min}–${r.max}</b> damage (effective ø ${avg}).</div>
      <button class="fmono-toggle">${s.showFormula ? "Hide" : "Show"} exact game formula</button>
      <div class="fmono" ${s.showFormula ? "" : "hidden"}>⌊⌊(⌊2·${s.level}÷5+2⌋ · ${s.power} · ${effAtk}) ÷ ${effDef}⌋ ÷ 50⌋ + 2 = ${r.base} → × STAB ${s.stab} × type ${fmtMult(eff)} × crit ${s.crit} × weather ${s.weather} × burn ${s.burn} × other ${s.other} × roll</div>`;
  }

  render();
}
