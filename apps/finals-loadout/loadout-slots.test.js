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
