// Effective ("cleaned") stat model.
//
// The headline feature: a Pokemon's Base Stat Total counts stats it can't use.
// A pure physical attacker's Sp.Atk is dead weight; a 50-base-Speed mon's Speed
// barely matters because it moves last anyway. We discount those and report a
// "cleaned total" that reflects the stats the Pokemon actually leverages.
//
// All of this runs in the browser from raw stats + movepool category counts, so
// the weighting sliders re-rank the whole list instantly with no data refresh.

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_LABELS = {
  hp: "HP", atk: "Atk", def: "Def", spa: "Sp.Atk", spd: "Sp.Def", spe: "Speed",
};

export const DEFAULT_WEIGHTS = {
  wasteLowerAtk: true,  // the lower of Atk/Sp.Atk counts as 0 (you attack with one)
  wasteLowSpeed: true,  // Speed at/below speedCap counts as 0 (you move last anyway)
  speedCap: 60,         // Speed threshold for "too slow to matter"
};

// In-game stat conversion. Pokemon Champions battles are at Level 50; we show the
// standard baseline: 31 IVs, 0 EVs, neutral nature (what most dex tools display).
const LV = 50, IV = 31, EV = 0;
export function statsFor(mon, mode) {
  const b = mon.stats;
  if (mode !== "lv50") return b;
  const c = (base) => Math.floor(0.01 * (2 * base + IV + Math.floor(EV / 4)) * LV) + 5;
  return {
    hp: Math.floor(0.01 * (2 * b.hp + IV + Math.floor(EV / 4)) * LV) + LV + 10,
    atk: c(b.atk), def: c(b.def), spa: c(b.spa), spd: c(b.spd), spe: c(b.spe),
  };
}
// Upper bound for bar/radar scaling (Lv50 numbers run higher than base).
export const statScaleMax = (mode) => (mode === "lv50" ? 220 : 200);

// Which attacking stats does this mon keep? The higher one; the lower is wasted
// (when enabled) because you attack with one side.
export function attackKeep(mon, w) {
  const { atk, spa } = mon.stats;
  if (!w.wasteLowerAtk) return { keepAtk: 1, keepSpA: 1 };
  if (atk > spa) return { keepAtk: 1, keepSpA: 0 };
  if (spa > atk) return { keepAtk: 0, keepSpA: 1 };
  // tie: keep the side the movepool favours (default physical)
  return mon.off.spec > mon.off.phys ? { keepAtk: 0, keepSpA: 1 } : { keepAtk: 1, keepSpA: 0 };
}

export function speedKeep(spe, w) {
  return w.wasteLowSpeed && spe <= w.speedCap ? 0 : 1;
}

export function roleOf(mon) {
  const { atk, spa, hp, def, spd } = mon.stats;
  if (Math.max(atk, spa) <= 65 && hp + def + spd >= 250) return "defensive";
  if (Math.abs(atk - spa) <= 10) return "mixed";
  return atk > spa ? "physical" : "special";
}

export function speedTier(spe) {
  if (spe >= 100) return "fast";
  if (spe <= 55) return "slow";
  return "medium";
}

// Full effective breakdown for one Pokemon under the given weights + display mode.
// The "what's wasted" decision always uses BASE stats (the sliders are tuned for
// them); the magnitudes are shown in the selected mode (base or Lv 50).
export function computeEffective(mon, w, mode = "base") {
  const ds = statsFor(mon, mode);
  const { keepAtk, keepSpA } = attackKeep(mon, w);
  const speMult = speedKeep(mon.stats.spe, w);
  const eff = {
    hp: ds.hp,
    atk: ds.atk * keepAtk,
    def: ds.def,
    spa: ds.spa * keepSpA,
    spd: ds.spd,
    spe: ds.spe * speMult,
  };
  const bst = STAT_KEYS.reduce((s, k) => s + ds[k], 0);
  const cleaned = STAT_KEYS.reduce((s, k) => s + eff[k], 0);
  return {
    disp: ds,
    bst,
    eff,
    cleaned: Math.round(cleaned),
    wasted: Math.round(bst - cleaned),
    keepAtk,
    keepSpA,
    speMult,
    role: roleOf(mon),
    speedTier: speedTier(mon.stats.spe),
  };
}

// Human-readable reasons for what got discounted (uses display-mode numbers).
export function explainEffective(mon, e) {
  const s = e.disp;
  const out = [];
  if (e.keepSpA === 0) {
    out.push(`Sp.Atk ${s.spa} → 0 (lower attacking stat — wasted)`);
  }
  if (e.keepAtk === 0) {
    out.push(`Atk ${s.atk} → 0 (lower attacking stat — wasted)`);
  }
  if (e.speMult === 0) {
    out.push(`Speed ${s.spe} → 0 (too slow to matter — wasted)`);
  }
  if (!out.length) out.push("Nothing wasted — this mon uses its whole stat spread.");
  return out;
}
