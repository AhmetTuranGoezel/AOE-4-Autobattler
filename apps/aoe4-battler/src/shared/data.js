export let units = {};
export let unitIndex = null;
export let allAvailableTags = new Set();

export async function loadUnitData() {
  try {
    const [indexResponse, unitsResponse] = await Promise.all([
      fetch("units_index.json"),
      fetch("units_restructured.json")
    ]);
    unitIndex = await indexResponse.json();
    units = await unitsResponse.json();
  } catch (error) {
    console.warn("Falling back to full unit data only.", error);
    const response = await fetch("units_restructured.json");
    units = await response.json();
    unitIndex = null;
  }

  allAvailableTags = new Set(unitIndex?.allTags || []);
  if (!allAvailableTags.size) {
    Object.values(units).forEach((unit) => {
      if (!unit.tags) return;
      unit.tags.forEach((tag) => allAvailableTags.add(tag));
    });
  }

  return { units, unitIndex, allAvailableTags };
}

export function getCivOrder() {
  return unitIndex?.civOrder || [];
}

export function getTypeOrder() {
  return unitIndex?.typeOrder || [];
}

export function getUnitMeta(unitName) {
  return unitIndex?.units?.[unitName] || units?.[unitName] || null;
}
