import { ITEMS, normalizeItem } from "./item-model.js";
import { canonicalSlug, validSpread, NATURES } from "./set-model.js";

export function selectMetaDataset(data, regulation) {
  const dataset = data.tournamentMeta?.datasets?.[regulation];
  if (!dataset) return false;
  data.metaRegulation = regulation;
  for (const mon of data.pokemon) {
    const entry = dataset.pokemon[mon.slug];
    mon.metaUsage = entry || null;
    mon.metaRegulation = regulation;
    // Runtime compatibility view for existing consumers, never static mechanics.
    mon.usage = Object.fromEntries(["abilities", "items", "natures", "moves"].map((k) => [k,
      (entry?.[k] || []).map((row) => [row.name, row.percent]) ]));
    if (entry?.pointAllocation) mon.usage.spread = entry.pointAllocation;
    delete mon.usagePct; // Old list-page season share is not this tournament sample.
  }
  return true;
}

export function teamsForPokemon(data, mon) {
  const ids = new Set(mon.metaUsage?.teamIds || []);
  return (data.tournamentTeams?.teams || []).filter((t) => t.regulation === data.metaRegulation && ids.has(t.id));
}

export function mapTournamentTeam(team, data) {
  const errors = [], warnings = [];
  if (!Array.isArray(team?.members) || team.members.length !== 6) return { errors: ["The source does not contain six Pokémon."], warnings, members: [] };
  const bySlug = new Map(data.pokemon.map((m) => [m.slug, m]));
  const moveIds = new Map(Object.entries(data.moves).map(([id, move]) => [move.slug || canonicalSlug(move.name), Number(id)]));
  const members = team.members.map((set, index) => {
    const mon = bySlug.get(set.form || set.pokemon);
    if (!mon) { errors.push(`Unknown Pokémon/form slug: ${set.form || set.pokemon}`); return null; }
    const moves = set.moves.map((slug) => {
      const id = moveIds.get(slug);
      if (id == null) errors.push(`${mon.name}: unmapped move ${slug}`);
      else if (!mon.moves.includes(id)) warnings.push(`${mon.name}: ${data.moves[id].name} is not confirmed in the current learnset.`);
      return id;
    });
    if (set.moves.length > 4) errors.push(`${mon.name}: more than four moves.`);
    if (!Object.hasOwn(ITEMS, set.item)) errors.push(`${mon.name}: unmapped item ${set.item}`);
    if (set.nature && !NATURES.includes(set.nature.toLowerCase())) errors.push(`${mon.name}: unknown nature ${set.nature}`);
    if (set.statsKnown && !validSpread(set.stats)) errors.push(`${mon.name}: invalid complete Stat Point spread.`);
    if (!set.statsKnown) warnings.push(`${mon.name}: Stat Points undisclosed; no exact spread was imported.`);
    let ability = set.ability;
    let sourceAbility = null;
    if (!data.abilities[ability]) errors.push(`${mon.name}: unmapped ability ${ability || "(undisclosed)"}`);
    else if (!mon.abilities.some((a) => a.slug === ability)) {
      const base = bySlug.get(mon.slug.replace(/-mega(?:-[a-z0-9]+)?$/, ""));
      if (mon.isMega && base?.abilities.some((a) => a.slug === ability)) {
        sourceAbility = ability;
        ability = mon.abilities[0]?.slug;
        warnings.push(`${mon.name}: retained pre-Mega ${sourceAbility}; battle calculations use ${ability}.`);
      } else errors.push(`${mon.name}: source ability ${ability} does not match this form's mechanics.`);
    }
    return { slug: mon.slug, moves, ability, sourceAbility, sourceItem: set.item,
      item: normalizeItem(set.item, mon), nature: set.nature?.toLowerCase() || null,
      spread: set.statsKnown ? structuredClone(set.stats) : null, picked: index < 4 };
  });
  if (new Set(members.filter(Boolean).map((m) => m.slug)).size !== 6) errors.push("Duplicate or unmapped team slots need review.");
  return { name: team.title, members, errors, warnings };
}

// Source teammate aggregates can list both versions of one slot. Keep the base
// as the group total and show Mega entries as detail, never sum overlapping counts.
export function groupTeammates(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const base = row.id.replace(/-mega(?:-[a-z0-9]+)?$/, "");
    const group = groups.get(base) || { id: base, base: null, forms: [] };
    if (row.id === base) group.base = row; else group.forms.push(row);
    groups.set(base, group);
  }
  return [...groups.values()];
}
