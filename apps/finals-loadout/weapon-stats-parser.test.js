'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const combat = require('./weapon-timeline.js');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const parserSource = html.slice(html.indexOf('    function parseCsvRows('), html.indexOf('    function renderAppView('));
const context = vm.createContext({ FinalsCombat: combat,
  WEAPON_COLOR_PALETTE: ['#abc', '#def'], WEAPON_STATS_CONFIG: { csvFormat: 'krome' },
  getItemByName: (name) => ['93R', 'FAMAS', 'ARN-220'].includes(name) });
vm.runInContext(parserSource, context);

function fixture(withStamina) {
  const range = withStamina ? 28 : 27;
  const header = Array(range + 4).fill('');
  header[0] = 'Krome Weapon Sheet - Last Update : ver. 11.9.0 LIGHT';
  header[2] = 'Name';
  header[7] = 'RPM';
  header[13] = 'Shots Per Burst';
  header[14] = 'Delay Until Next Burst';
  header[range] = 'Range Stats Damage Dropoff Minimum Range';
  header[range + 1] = 'Damage Dropoff Maximum Range';
  header[range + 2] = 'Damage Dropoff Modifier @ Max Range';
  header[range + 3] = '  Important Notes';
  const r93 = ['', '1', '93R', 'Handgun', 'Burst', '24', '36', '1000', '27', '648', '972', '1.45', '1.75', '3', '0.275'];
  r93[range] = '30m'; r93[range + 1] = '37.5m'; r93[range + 2] = '~50%'; r93[range + 3] = 'Burst notes';
  const arn = ['', '2', 'ARN-220', 'Assault Rifle', 'Automatic', '17', '25.5', '750', '30\u00d72', '', '', '2.45', '2.7', '-', '-'];
  arn[range] = '37.5m'; arn[range + 1] = '45m'; arn[range + 2] = '~72%';
  const famas = ['', '7', 'FAMAS', 'Assault Rifle', 'Burst', '24', '36', '1080', '27', '', '', '2.15', '2.4', '3', '0.27'];
  famas[range] = '35m'; famas[range + 1] = '42.5m'; famas[range + 2] = '~50%';
  return [header, r93, arn, ['MEDIUM'], famas];
}

function currentFixture() {
  const header = Array(37).fill('');
  header[0] = "Krome's Weapon Data Sheet Overview - Last Update : ver. 11.9.0 LIGHT";
  header[1] = 'ikrome (DM open if you need) Name';
  header[2] = 'Primary Stats Type';
  header[3] = 'Firing Mode';
  header[4] = 'Damage\n@ Body';
  header[5] = 'Damage\n@ Head';
  header[6] = 'Damage\n@ Environment';
  header[7] = 'RPM';
  header[8] = 'Magazine';
  header[9] = 'DPM** @ Body';
  header[10] = 'DPM** @ Head';
  header[11] = 'Tactical RT***\n(in seconds)';
  header[12] = 'Empty RT***\n(in seconds)';
  header[13] = 'Range Stats DD* Min. Range (in meter)';
  header[14] = 'DD Max. Range\n(in meter)';
  header[15] = 'DD* Modifier @ Max Range (in %)';
  header[16] = 'Special Stats Shots Per Burst';
  header[17] = 'Delay Until Next Burst';
  header[18] = 'vs. LIGHT TTK @ Body (in seconds)';
  header[19] = 'STK @ Body';
  header[36] = '  Important Notes';
  const r93 = ['', '93R', 'Handgun', 'Burst', '24', '36', '?', '1000', '27', '648', '972',
    '1.45', '1.75', '30', '37.5', '50', '3', '0.275', '0.81', '7'];
  r93[36] = 'Burst notes';
  const arn = ['', 'ARN-220', 'Assault Riffle', 'Automatic', '17', '25.5', '?', '750', '', '', '',
    '2.45', '', '37.5', '45', '72', '-', '-'];
  arn[36] = 'Linked magazines';
  const mediumHeader = Array(37).fill('');
  mediumHeader[0] = 'MEDIUM'; mediumHeader[1] = 'Name'; mediumHeader[2] = 'Type';
  const akm = ['', 'AKM', 'Assault Riffle', 'Automatic', '21', '31.5', '?', '600', '34', '714', '1071',
    '2.35', '2.35', '30', '37.5', '55', '-', '-'];
  const famas = ['', 'FAMAS', 'Assault Riffle', 'Burst', '24', '36', '?', '1080', '27', '648', '972',
    '2.15', '2.4', '35', '42.5', '50', '3', '0.27'];
  const flame = ['', 'FLAMETHROWER', 'Miscellaneous', 'Automatic', '30', '', '?', '170', '30', '900', '',
    '3.55', '3.55', '', '', '', '-', '-'];
  return [header, r93, arn, mediumHeader, akm, famas, ['HEAVY', 'Name', 'Type'], flame,
    ['LEGEND'], ['', 'Missing and/or outdated'], ['SOURCES'], ['The Finals Wiki']];
}

test('current Krome headers restore names and stats after removal of the number column', () => {
  const weapons = context.normalizeWeaponStatsFromRows(currentFixture());
  assert.deepEqual(Array.from(weapons, (weapon) => weapon.name), ['93R', 'AKM', 'ARN-220', 'FAMAS', 'Flamethrower']);
  const r93 = weapons.find((weapon) => weapon.name === '93R');
  assert.equal(r93.bodyDamage, 24);
  assert.equal(r93.headDamage, 36);
  assert.equal(r93.rpm, 1000);
  assert.equal(r93.magazineSize, 27);
  assert.equal(r93.tacticalReload, 1.45);
  assert.equal(r93.emptyReload, 1.75);
  assert.equal(r93.burstCount, 3);
  assert.equal(r93.burstDelay, 0.275);
  assert.equal(r93.minDropoff, 30);
  assert.equal(r93.maxDropoff, 37.5);
  assert.equal(r93.dropoffModifier, 0.5);
  assert.equal(r93.notes, 'Burst notes');
  assert.equal(r93.loadoutItemName, '93R');
  const schedule = combat.createWeaponTimeline(r93);
  assert.ok(Math.abs(schedule.shots[3].time - 0.395) < 1e-8);
  assert.equal(weapons.find((weapon) => weapon.name === 'AKM').className, 'MEDIUM');
  const arn = weapons.find((weapon) => weapon.name === 'ARN-220');
  assert.equal(arn.magazineSize, null);
  assert.equal(arn.dropoffModifier, 0.72);
  assert.ok(Math.abs(combat.getKillTime(combat.createWeaponTimeline(arn), 250).time - 1.12) < 1e-8);
  const flame = weapons.find((weapon) => weapon.name === 'Flamethrower');
  assert.equal(flame.className, 'HEAVY');
  assert.equal(flame.headDamage, flame.bodyDamage);
});

test('Krome header mapping follows reordered columns and skips notes that resemble headings', () => {
  const original = currentFixture();
  original[1][36] = 'Damage @ Body';
  const order = [0, 2, 6, 4, 17, 14, 1, 12, 3, 8, 16, 11, 7, 5, 15, 13,
    ...Array.from({ length: 21 }, (_, index) => index + 16).filter((index) => index !== 16 && index !== 17)];
  const reordered = original.map((row) => order.map((index) => row[index] ?? ''));
  assert.equal(new Set(order).size, 35);
  const expected = context.normalizeWeaponStatsFromRows(original);
  const actual = context.normalizeWeaponStatsFromRows(reordered);
  assert.deepEqual(actual, expected);
});

for (const stamina of [false, true]) {
  test(`Krome ${stamina ? 'new' : 'old'} headers map falloff and notes without shifted columns`, () => {
    const rows = context.normalizeWeaponStatsFromRows(fixture(stamina));
    const r93 = rows.find((w) => w.name === '93R');
    assert.equal(r93.version, '11.9.0');
    assert.equal(r93.intraBurstRpm, 1000);
    assert.equal(r93.burstDelay, 0.275);
    assert.equal(r93.minDropoff, 30);
    assert.equal(r93.maxDropoff, 37.5);
    assert.equal(r93.dropoffModifier, 0.5);
    assert.equal(r93.notes, 'Burst notes');
    const famas = rows.find((w) => w.name === 'FAMAS');
    assert.equal(famas.className, 'MEDIUM');
    assert.equal(famas.intraBurstRpm, 1080);
    const arn = rows.find((w) => w.name === 'ARN-220');
    assert.equal(arn.magazineRaw, '30\u00d72');
    assert.equal(combat.createWeaponTimeline(arn).magazineCount, 2);
    assert.ok(Math.abs(combat.getKillTime(combat.createWeaponTimeline(arn), 250).time - 1.12) < 1e-8);
  });
}

test('GViz formatted cells, missing linked mags and CSV quoting remain supported', () => {
  const table = { cols: [{ label: 'Name' }, { label: 'Magazine' }], rows: [{ c: [{ v: 'ARN-220' }, { v: 30, f: '30\u00d72' }] }] };
  assert.equal(context.googleSheetTableToRows({ table })[1][1], '30\u00d72');
  const rows = fixture(true);
  rows[2][8] = ''; rows[2][12] = '';
  const arn = context.normalizeWeaponStatsFromRows(rows).find((w) => w.name === 'ARN-220');
  assert.equal(arn.magazineSize, null);
  const timeline = combat.createWeaponTimeline(arn);
  assert.equal(timeline.rounds, 30);
  assert.equal(timeline.magazineCount, 2);
  assert.ok(Math.abs(timeline.shots[30].time - timeline.shots[29].time - 0.66) < 1e-8);
  const csv = 'Name,Notes\r\n93R,"two, fields and ""quotes""\nnew line"';
  assert.equal(context.parseCsvRows(csv)[1][1], 'two, fields and "quotes"\nnew line');
});

test('zero damage falloff and unlimited/missing capacities are not conflated', () => {
  assert.equal(context.parseDropoffModifier('0%'), 0);
  assert.equal(context.parseMagazineSize(''), null);
  assert.equal(context.parseMagazineSize(Infinity), Infinity);
  const row = context.normalizeWeaponStatRow({ Name: 'Test', Class: 'Light', 'Body Damage': 10,
    RPM: 600, 'Magazine Size': '30x2' });
  assert.equal(row.magazineRaw, '30x2');
  assert.equal(row.magazineSize, 30);
});
