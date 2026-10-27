'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const source = html.slice(html.indexOf('    const STORAGE_KEY'), html.indexOf('    const storageLoad'));
const app = vm.createContext({ FinalsCombat: require('./weapon-timeline.js') });
vm.runInContext(source, app);
const weapon = { area: 'mainWeapon', index: 0 };
const reserve = { area: 'reserve', index: 0 };
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const build = app.createBlankBuild('medium');
  Object.assign(build, { name: 'Swap regression', specialization: 'Healing Beam', mainWeapon: 'AKM',
    mainGadgets: ['Defibrillator', 'Jump Pad', 'Zipline'] });
  build.slotAlternatives.mainWeapon = ['P90', 'R .357'];
  build.slotAlternatives.mainGadgets[0] = ['APS Turret'];
  build.reserve[0] = app.createReserveEntry('FCAR', ['FAMAS', 'Model 1887', 'CB-01 Repeater']);
  build.reserve[1] = app.createReserveEntry('Frag Grenade', ['Pyro Grenade']);
  build.reserve[2] = app.createReserveEntry('Gas Grenade');
  build.reserve[3] = app.createReserveEntry('Goo Grenade');
  return build;
}

test('main and reserve weapons exchange whole bundles without losing or duplicating items', () => {
  const build = fixture();
  const names = Array.from(app.collectAllSelectedItemNames(build)).sort();
  assert.equal(app.swapLoadoutSlots(build, weapon, reserve), true);
  assert.equal(build.mainWeapon, 'FCAR');
  assert.deepEqual(plain(build.slotAlternatives.mainWeapon), ['FAMAS', 'Model 1887', 'CB-01 Repeater']);
  assert.deepEqual(plain(build.reserve[0]), { primary: 'AKM', alternatives: ['P90', 'R .357'] });
  assert.deepEqual(Array.from(app.collectAllSelectedItemNames(build)).sort(), names);
  assert.equal(new Set(names).size, names.length);
});

test('starting a swap from reserve produces the same exchange and can restore the original build', () => {
  const build = fixture();
  const original = plain(build);
  const fromMain = fixture();
  app.swapLoadoutSlots(fromMain, weapon, reserve);
  assert.equal(app.swapLoadoutSlots(build, reserve, weapon), true);
  assert.deepEqual(plain(build), plain(fromMain));
  assert.equal(app.swapLoadoutSlots(build, reserve, weapon), true);
  assert.deepEqual(plain(build), original);
});

test('main gadgets and reserve gadgets carry their alternatives in both directions', () => {
  const build = fixture();
  const gadget = { area: 'mainGadget', index: 0 };
  const spare = { area: 'reserve', index: 1 };
  assert.equal(app.swapLoadoutSlots(build, gadget, spare), true);
  assert.equal(build.mainGadgets[0], 'Frag Grenade');
  assert.deepEqual(plain(build.slotAlternatives.mainGadgets[0]), ['Pyro Grenade']);
  assert.deepEqual(plain(build.reserve[1]), { primary: 'Defibrillator', alternatives: ['APS Turret'] });
  assert.equal(app.swapLoadoutSlots(build, spare, gadget), true);
  assert.deepEqual(plain(build), plain(fixture()));
});

test('reordering gadget and free reserve slots also reorders their alternatives', () => {
  const build = fixture();
  assert.equal(app.swapLoadoutSlots(build, { area: 'mainGadget', index: 0 }, { area: 'mainGadget', index: 2 }), true);
  assert.deepEqual(plain(build.mainGadgets), ['Zipline', 'Jump Pad', 'Defibrillator']);
  assert.deepEqual(plain(build.slotAlternatives.mainGadgets), [[], [], ['APS Turret']]);
  assert.equal(app.swapLoadoutSlots(build, reserve, { area: 'reserve', index: 1 }), true);
  assert.deepEqual(plain(build.reserve[0]), { primary: 'Frag Grenade', alternatives: ['Pyro Grenade'] });
  assert.deepEqual(plain(build.reserve[1]), { primary: 'FCAR', alternatives: ['FAMAS', 'Model 1887', 'CB-01 Repeater'] });
});

test('incompatible primaries or mixed alternatives block the whole swap without discarding data', () => {
  const build = fixture();
  let original = plain(build);
  assert.equal(app.swapLoadoutSlots(build, weapon, { area: 'reserve', index: 1 }), false);
  assert.equal(app.swapLoadoutSlots(build, { area: 'specialization', index: 0 }, reserve), false);
  assert.deepEqual(plain(build), original);
  build.reserve[0].alternatives = ['FAMAS', 'Gas Grenade'];
  original = plain(build);
  assert.equal(app.swapLoadoutSlots(build, weapon, reserve), false);
  assert.equal(app.swapLoadoutSlots(build, reserve, weapon), false);
  assert.deepEqual(plain(build), original);
  build.reserve[1].alternatives = ['P90'];
  original = plain(build);
  assert.equal(app.swapLoadoutSlots(build, { area: 'mainGadget', index: 0 }, { area: 'reserve', index: 1 }), false);
  assert.deepEqual(plain(build), original);
});

test('empty main or reserve slots accept a compatible bundle', () => {
  const build = fixture();
  build.mainWeapon = null;
  build.slotAlternatives.mainWeapon = [];
  assert.equal(app.swapLoadoutSlots(build, weapon, reserve), true);
  assert.equal(build.mainWeapon, 'FCAR');
  assert.deepEqual(plain(build.slotAlternatives.mainWeapon), ['FAMAS', 'Model 1887', 'CB-01 Repeater']);
  assert.deepEqual(plain(build.reserve[0]), { primary: null, alternatives: [] });
  assert.equal(app.swapLoadoutSlots(build, reserve, weapon), true);
  assert.equal(build.mainWeapon, null);
  assert.equal(build.reserve[0].primary, 'FCAR');
});

test('wrong-class items, the same slot and invalid slot addresses leave the build unchanged', () => {
  const build = fixture();
  build.reserve[0].alternatives = ['ARN-220'];
  const original = plain(build);
  assert.equal(app.swapLoadoutSlots(build, weapon, reserve), false);
  for (const slot of [weapon, null, { area: 'reserve', index: 9 }, { area: 'mainGadget', index: -1 },
    { area: 'unknown', index: 0 }, { area: 'reserve', index: 0.5 }]) {
    assert.equal(app.swapLoadoutSlots(build, weapon, slot), false);
  }
  assert.deepEqual(plain(build), original);
});

test('swapped alternatives survive the existing save/import normalization', () => {
  const build = fixture();
  app.swapLoadoutSlots(build, weapon, reserve);
  app.swapLoadoutSlots(build, { area: 'mainGadget', index: 0 }, { area: 'reserve', index: 1 });
  assert.deepEqual(plain(app.normalizeLoadedBuild(plain(build))), plain(build));
});

test('Prime Time equipment is class-valid and retains verified wiki image filenames', () => {
  const light = app.getClassPools('light');
  const medium = app.getClassPools('medium');
  const heavy = app.getClassPools('heavy');
  assert.ok(light.specializations.some((item) => item.name === 'True Sight'));
  for (const name of ['Mimic Device', 'Translocator']) {
    assert.ok(light.allGadgets.some((item) => item.name === name));
    assert.ok(light.reserve.some((item) => item.name === name));
    assert.ok(!medium.reserve.some((item) => item.name === name));
    assert.ok(!heavy.reserve.some((item) => item.name === name));
  }
  assert.equal(app.getItemByName('True Sight').imageFilename, 'Thermal Vision Rank 1.png');
  assert.equal(app.getItemByName('Mimic Device').imageFilename, 'Mimic Device Rank 1.png');
  assert.equal(app.getItemByName('Translocator').imageFilename, 'Translocator Rank 1.png');
  assert.ok(medium.allGadgets.some((item) => item.name === 'Sonar Grenade'));
  assert.ok(!heavy.allGadgets.some((item) => item.name === 'Sonar Grenade'));
});

test('old Thermal Vision builds and their item notes remain intact during normalization', () => {
  const build = app.createBlankBuild('light');
  build.mainGadgets[0] = 'Thermal Vision';
  build.reserve[0] = app.createReserveEntry('Mimic Device', ['Translocator']);
  build.specialization = 'True Sight';
  const library = { version: 2, builds: [plain(build)], itemNotes: {
    'Thermal Vision': 'My old reminder', 'True Sight': 'My new reminder', 'Mimic Device': 'Prop reminder'
  } };
  const result = plain(app.normalizeStorageEnvelope(library).envelope);
  assert.deepEqual(result, library);
});

test('four alternatives survive cloning, save/import normalization and whole-slot swaps', () => {
  const build = fixture();
  build.reserve[0] = app.createReserveEntry('Model 1887', ['Cerberus 12GA']);
  build.slotAlternatives.mainWeapon = ['P90', 'R .357', 'FAMAS', 'FCAR'];
  const copy = app.cloneBuild(build);
  assert.deepEqual(plain(copy), plain(build));
  assert.deepEqual(plain(app.normalizeLoadedBuild(plain(build))), plain(build));
  assert.equal(app.swapLoadoutSlots(copy, weapon, reserve), true);
  assert.deepEqual(plain(copy.reserve[0]), { primary: 'AKM', alternatives: ['P90', 'R .357', 'FAMAS', 'FCAR'] });
  assert.deepEqual(plain(app.normalizeLoadedBuild(plain(copy))), plain(copy));
  assert.deepEqual(plain(build.slotAlternatives.mainWeapon), ['P90', 'R .357', 'FAMAS', 'FCAR']);
});

test('tapping a register swaps the primary into that exact position without reordering other tabs', () => {
  const build = fixture();
  build.reserve[0] = app.createReserveEntry('Model 1887');
  build.slotAlternatives.mainWeapon = ['P90', 'R .357', 'FAMAS', 'FCAR'];
  const original = plain(build);
  assert.equal(app.promoteLoadoutAlternative(build, 'mainWeapon', 0, 'FAMAS'), true);
  assert.equal(build.mainWeapon, 'FAMAS');
  assert.deepEqual(plain(build.slotAlternatives.mainWeapon), ['P90', 'R .357', 'AKM', 'FCAR']);
  assert.equal(app.promoteLoadoutAlternative(build, 'mainWeapon', 0, 'AKM'), true);
  assert.deepEqual(plain(build), original);
  assert.equal(app.promoteLoadoutAlternative(build, 'mainWeapon', 0, 'Sword'), false);
  assert.deepEqual(plain(build), original);
});

test('reserve and gadget register swaps keep the other alternatives in order', () => {
  const build = fixture();
  build.reserve[0].alternatives.push('Chimera-XB');
  assert.equal(app.promoteLoadoutAlternative(build, 'reserve', 0, 'CB-01 Repeater'), true);
  assert.deepEqual(plain(build.reserve[0]), { primary: 'CB-01 Repeater', alternatives: ['FAMAS', 'Model 1887', 'FCAR', 'Chimera-XB'] });
  build.slotAlternatives.mainGadgets[0] = ['APS Turret', 'Gas Mine', 'Explosive Mine', 'Sonar Grenade'];
  assert.equal(app.promoteLoadoutAlternative(build, 'mainGadget', 0, 'Sonar Grenade'), true);
  assert.equal(build.mainGadgets[0], 'Sonar Grenade');
  assert.deepEqual(plain(build.slotAlternatives.mainGadgets[0]), ['APS Turret', 'Gas Mine', 'Explosive Mine', 'Defibrillator']);
});

test('oversized imports are capped at four alternatives for main and reserve slots', () => {
  const build = fixture();
  build.slotAlternatives.mainWeapon = ['P90', 'R .357', 'Cerberus 12GA', 'Chimera-XB', 'Pike-556'];
  build.reserve[0].alternatives = ['FAMAS', 'Model 1887', 'CB-01 Repeater', 'Riot Shield', 'Dual Blades'];
  const normalized = app.normalizeLoadedBuild(plain(build));
  assert.equal(normalized.slotAlternatives.mainWeapon.length, 4);
  assert.equal(normalized.reserve[0].alternatives.length, 4);
  assert.equal(normalized.slotAlternatives.mainWeapon[3], 'Chimera-XB');
  assert.equal(normalized.reserve[0].alternatives[3], 'Riot Shield');
});
