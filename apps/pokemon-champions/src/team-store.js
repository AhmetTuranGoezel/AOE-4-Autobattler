// Identity belongs to the saved record, never to its editable display name.
export const newTeamId = () => crypto.randomUUID();
export const emptyTeamContext = (name = "") => ({ loadedId: null, originalName: "", name });
export function migrateSavedTeams(records, makeId = newTeamId) {
  if (!Array.isArray(records)) throw new Error("Saved teams must be an array");
  const used = new Set();
  return records.map((record) => {
    if (!record || !Array.isArray(record.members)) throw new Error("Invalid saved team record");
    let id = record.id == null ? "" : String(record.id);
    if (!id || used.has(id)) { do { id = makeId(); } while (used.has(id)); }
    used.add(id);
    return { ...record, id, name: String(record.name || "Team").trim() || "Team" };
  });
}
export function saveTeamRecord(records, context, members, makeId = newTeamId) {
  const name = String(context.name || "").trim();
  if (!name) return { error: "Enter a team name before saving." };
  if (!members.length) return { error: "Add a Pokémon before saving." };
  const loaded = records.find((t) => t.id === context.loadedId);
  const update = loaded && name === context.originalName;
  const conflict = records.find((t) => t.name.toLowerCase() === name.toLowerCase() && (!update || t.id !== loaded.id));
  if (conflict) return { error: `“${name}” already belongs to a saved team. Choose another name, or load that team to update it.` };
  const id = update ? loaded.id : makeId();
  const record = { ...(update ? loaded : {}), id, name, members: structuredClone(members) };
  return {
    records: update ? records.map((t) => t.id === id ? record : t) : [...records, record],
    context: { loadedId: id, originalName: name, name },
    action: update ? "updated" : "created",
  };
}
