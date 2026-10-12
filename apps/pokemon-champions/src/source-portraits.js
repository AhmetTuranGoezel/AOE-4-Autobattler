// Presentation-only identities absent from the local eligible roster. These
// PokeAPI National Dex sprites do NOT resolve a form or authorize an import.
// Sprite provenance: https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon
const SOURCE_SPECIES = Object.freeze({
  floette: 670,
  gothitelle: 576,
  kingdra: 230,
  octillery: 224,
});

export function sourcePortrait(identity) {
  const id = SOURCE_SPECIES[identity];
  if (!Object.hasOwn(SOURCE_SPECIES, identity)) return null;
  return {
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    sourceOnly: true,
  };
}
