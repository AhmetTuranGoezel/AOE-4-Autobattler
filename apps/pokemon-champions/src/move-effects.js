// Consumers share the generated multi-stat model; no English stat parsing or
// second setup-move fact table. This describes successful effects, not full turns.
export const STAT_LABELS = { atk: "Atk", def: "Def", spa: "Sp.Atk", spd: "Sp.Def", spe: "Spe", accuracy: "Acc", evasion: "Eva" };
const RECIPIENTS = ["self", "target", "allies"];

export function statEffectChips(move) {
  const effects = move.statChanges || {}, chips = [];
  function append(effect, { chance = 100, condition = "", secondary = false } = {}) {
    for (const recipient of RECIPIENTS) {
      for (const [stat, amount] of Object.entries(effect[recipient] || {})) {
        const self = recipient === "self", lower = amount < 0;
        chips.push({
          txt: `${secondary ? `${chance}% ` : ""}${lower ? "−" : "+"}${Math.abs(amount)} ${STAT_LABELS[stat]}${self ? " self" : recipient === "allies" ? " allies" : ""}${condition ? ` (${condition})` : ""}`,
          cls: condition ? "cond" : secondary ? (chance >= 100 ? "sure" : chance >= 50 ? "often" : "rare") : self ? (lower ? "cost" : "gain") : (lower ? "sure" : "gain"),
          title: condition ? "Conditional stat change" : secondary ? "Secondary-effect chance" : "Primary stat change on successful use",
          stat, amount, recipient, chance, condition,
        });
      }
    }
  }
  append(effects);
  for (const effect of effects.secondary || []) append(effect, { chance: effect.chance, secondary: true });
  for (const effect of effects.conditional || []) append(effect, { condition: effect.label });
  return chips;
}

export function selfStatChanges(move, context = {}) {
  const effects = move.statChanges || {};
  let changes = { ...effects.self };
  for (const effect of effects.conditional || []) {
    const applies = effect.condition === "sun"
      ? ["sun", "harsh-sunshine"].includes(context.weather) && context.item !== "utility-umbrella"
      : effect.condition === "non-ghost" && Array.isArray(context.types) && !context.types.includes("ghost");
    if (applies) changes = { ...effect.self };
  }
  return changes;
}

export function setupEffect(move, context = {}, currentStages = {}) {
  if (move.class !== "status") return null; // Never assume a chance-based attack boosts us.
  const multiplier = context.ability === "contrary" ? -1 : context.ability === "simple" ? 2 : 1;
  const changes = Object.fromEntries(Object.entries(selfStatChanges(move, context)).map(([stat, amount]) => [stat, amount * multiplier]));
  const stages = { ...currentStages }, applied = {};
  for (const [stat, amount] of Object.entries(changes)) {
    stages[stat] = Math.max(-6, Math.min(6, (currentStages[stat] || 0) + amount));
    applied[stat] = stages[stat] - (currentStages[stat] || 0);
  }
  if (!Object.values(applied).some(amount => amount > 0)) return null;
  return { stages, changes: applied, notes: move.statChanges?.notes || [] };
}

export function formatStatChanges(changes) {
  return Object.entries(changes).filter(([, amount]) => amount).map(([stat, amount]) =>
    `${amount < 0 ? "−" : "+"}${Math.abs(amount)} ${STAT_LABELS[stat]}`).join(" / ");
}
