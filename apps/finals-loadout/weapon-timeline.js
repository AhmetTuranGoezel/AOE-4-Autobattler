(function (root) {
  'use strict';

  const EPS = 1e-9;
  const HEALTH = { Light: 150, Medium: 250, Heavy: 350 };
  const HIT_PATTERNS = ['BBBBBB', 'BBHBBB', 'BBHBBH', 'BHBHBH', 'HHBHHB', 'HHHBHH', 'HHHHHH'];

  function getHitPattern(headHits = 0) {
    return HIT_PATTERNS[Math.max(0, Math.min(6, Math.round(Number(headHits) || 0)))].split('');
  }
  // Supplement mechanics only. Damage, RPM, falloff and known reloads stay sheet-owned.
  const WEAPON_MECHANICS_OVERRIDES = {
    'Cerberus 12GA': {
      canHeadshot: false,
      dot: { damagePerSecond: 15, duration: 2, startDelay: 0, stackMode: 'refresh', maxStacks: 1, trigger: 'hit' },
      reload: { byMissingRounds: { 1: 2.1, 2: 2.25, 3: 2.85 } },
      notes: ['Assumes all pellets connect and ignite. Actual ignition requires enough pellets. Burn duration is approximate; full-empty reload uses the sheet.'],
      source: 'https://www.thefinals.wiki/wiki/Cerberus_12GA'
    },
    'Flamethrower': {
      canHeadshot: false,
      maxRange: 7.4,
      dot: { damagePerSecond: 15, duration: null, startDelay: null, stackMode: null, trigger: 'hit' },
      needsData: ['Direct damage only: burn duration, onset and refresh behavior need verification. Burn is NOT simulated.'],
      source: 'https://www.thefinals.wiki/wiki/Flamethrower'
    },
    'ARN-220': {
      magazine: { rounds: 30, count: 2, swapDuration: 0.66 },
      reload: { emptyFallback: 2.7, tacticalFallback: 2.45 },
      notes: ['Linked magazines: wiki 0.66s swap; current sheet note says 0.80s. Using the requested wiki timing pending reconciliation. Sheet reload values take priority.'],
      source: 'https://www.thefinals.wiki/wiki/ARN-220'
    },
    'SA1216': {
      needsData: ['Linked-magazine capacity and transition timings need verified data when missing from the sheet.']
    },
    'M134 Minigun': {
      notes: ['Fully spun up, as in the sheet. Spin-up and accuracy are not simulated.']
    }
  };

  function parseMagazine(value) {
    if (value === Infinity || /^(?:n\/a|-|infinity)$/i.test(String(value).trim())) {
      return { rounds: Infinity, count: 1 };
    }
    const match = String(value ?? '').trim().match(/^(\d+)\s*(?:[x\u00d7*]\s*(\d+))?/i);
    return match && Number(match[1]) > 0
      ? { rounds: Number(match[1]), count: Math.max(1, Number(match[2]) || 1) }
      : { rounds: null, count: 1 };
  }

  function mechanicsFor(weapon) {
    return weapon.mechanics || WEAPON_MECHANICS_OVERRIDES[weapon.name] || {};
  }

  function damageProfile(weapon, options = {}) {
    const mechanics = mechanicsFor(weapon);
    const range = Math.max(0, options.range || 0);
    let multiplier = 1;
    if (Number.isFinite(mechanics.maxRange) && range > mechanics.maxRange) {
      multiplier = 0;
    } else if (weapon.dropoffModifier >= 0 && weapon.dropoffModifier < 1) {
      if (weapon.maxDropoff > weapon.minDropoff) {
        const progress = Math.max(0, Math.min(1, (range - weapon.minDropoff) / (weapon.maxDropoff - weapon.minDropoff)));
        multiplier = 1 - (1 - weapon.dropoffModifier) * progress;
      } else if (weapon.maxDropoff > 0 && range > weapon.maxDropoff) {
        multiplier = weapon.dropoffModifier;
      }
    }
    const body = Math.max(0, weapon.bodyDamage || 0) * multiplier;
    const canHeadshot = mechanics.canHeadshot !== false && weapon.headDamage > weapon.bodyDamage;
    const head = canHeadshot ? weapon.headDamage * multiplier : body;
    return { body, head, canHeadshot };
  }

  function reloadDuration(weapon, missingRounds, mechanics = mechanicsFor(weapon)) {
    const magazine = parseMagazine(weapon.magazineRaw ?? weapon.magazineSize);
    const capacity = magazine.rounds || mechanics.magazine?.rounds;
    if (missingRounds === capacity) {
      return weapon.emptyReload > 0 ? weapon.emptyReload
        : mechanics.reload?.emptyFallback || mechanics.reload?.byMissingRounds?.[missingRounds] || null;
    }
    return mechanics.reload?.byMissingRounds?.[missingRounds]
      || (weapon.tacticalReload > 0 ? weapon.tacticalReload : mechanics.reload?.tacticalFallback) || null;
  }

  function isVerifiedDot(dot) {
    return Boolean(dot && dot.duration > 0 && dot.damagePerSecond > 0 && dot.startDelay != null
      && ['refresh', 'stack', 'replace'].includes(dot.stackMode));
  }

  function createDotSegments(shots, dot, duration) {
    if (!isVerifiedDot(dot)) return { segments: [], events: [] };
    const applications = shots.filter((shot) => shot.damage > 0 && (typeof dot.trigger !== 'function' || dot.trigger(shot)));
    const intervals = [];
    const events = [];
    applications.forEach((shot) => {
      const start = shot.time + Math.max(0, dot.startDelay);
      const end = start + dot.duration;
      const active = intervals.filter((interval) => interval.end > start + EPS);
      if (dot.stackMode === 'refresh' && active.length) {
        active[0].end = Math.max(active[0].end, end);
        events.push({ type: 'dot-refresh', time: start, end: active[0].end });
      } else {
        if (dot.stackMode === 'replace') active.forEach((interval) => { interval.end = start; });
        if (dot.stackMode === 'stack' && active.length >= (dot.maxStacks || Infinity)) {
          active.sort((a, b) => a.end - b.end)[0].end = start;
        }
        intervals.push({ start, end });
        events.push({ type: 'dot-start', time: start, end });
      }
    });
    const changes = new Map();
    intervals.forEach(({ start, end }) => {
      changes.set(start, (changes.get(start) || 0) + dot.damagePerSecond);
      changes.set(end, (changes.get(end) || 0) - dot.damagePerSecond);
    });
    const segments = [];
    let rate = 0;
    let previous = 0;
    for (const [time, change] of [...changes].sort((a, b) => a[0] - b[0])) {
      if (time > previous && rate > 0 && previous < duration) {
        segments.push({ start: previous, end: Math.min(time, duration), rate });
      }
      rate += change;
      previous = time;
    }
    intervals.forEach(({ end }) => { events.push({ type: 'dot-end', time: end }); });
    return { segments, events: events.filter((event) => event.time <= duration + EPS) };
  }

  function createWeaponTimeline(weapon, options = {}) {
    const duration = Math.max(0, Math.min(options.duration ?? 60, 120));
    const mechanics = mechanicsFor(weapon);
    const profile = damageProfile(weapon, options);
    const pattern = getHitPattern(options.headHits);
    const warnings = [...(mechanics.needsData || [])];
    const magazine = parseMagazine(weapon.magazineRaw ?? weapon.magazineSize);
    const rounds = magazine.rounds || mechanics.magazine?.rounds;
    const magazineCount = weapon.magazineCount || (magazine.count > 1 ? magazine.count : mechanics.magazine?.count) || 1;
    const rpm = weapon.intraBurstRpm || weapon.rpm;
    const interval = rpm > 0 ? 60 / rpm : Infinity;
    const burstCount = Math.max(1, Math.floor(weapon.burstCount || 1));
    const shots = [];
    const reloads = [];
    const burstGaps = [];
    let cumulativeDirect = 0;
    let time = 0;
    let magazineIndex = 0;
    let inMagazine = 0;
    let inBurst = 0;
    let burstIndex = 0;
    let knownUntil = duration;
    if (!(rpm > 0)) warnings.push('Firing cadence needs data; only the first hit is known.');
    if (!rounds) warnings.push('Magazine capacity needs data; only the first hit is known.');
    if (burstCount > 1 && !(weapon.burstDelay > 0)) warnings.push('Inter-burst delay needs data.');

    while (time <= duration + EPS && shots.length < 5000) {
      const placement = profile.canHeadshot ? pattern[shots.length % pattern.length] : 'B';
      const damage = placement === 'H' ? profile.head : profile.body;
      cumulativeDirect += damage;
      shots.push({ type: 'shot', time, index: shots.length + 1, magazineIndex, burstIndex,
        magazineShot: inMagazine + 1, burstShot: inBurst + 1, placement, damage, cumulativeDirect });
      inMagazine++;
      inBurst++;
      let delay;
      if (!rounds || !Number.isFinite(interval)) {
        knownUntil = time;
        break;
      }
      if (inMagazine >= rounds) {
        const swap = magazineIndex % magazineCount < magazineCount - 1;
        delay = swap ? (weapon.magazineSwap || mechanics.magazine?.swapDuration) : reloadDuration(weapon, rounds, mechanics);
        if (!(delay > 0)) {
          warnings.push(`${swap ? 'Magazine swap' : 'Empty reload'} duration needs data; firing stops at the magazine boundary.`);
          knownUntil = time;
          break;
        }
        reloads.push({ type: swap ? 'swap' : 'reload', start: time, end: time + delay, magazineIndex });
        magazineIndex++;
        inMagazine = 0;
        inBurst = 0;
        burstIndex++;
      } else if (inBurst >= burstCount) {
        delay = burstCount > 1 ? weapon.burstDelay : interval;
        if (!(delay > 0)) { knownUntil = time; break; }
        if (burstCount > 1) burstGaps.push({ type: 'burst-gap', time, start: time, end: time + delay, burstIndex });
        inBurst = 0;
        burstIndex++;
      } else {
        delay = interval;
      }
      time += delay;
    }
    const dot = createDotSegments(shots, mechanics.dot, duration);
    const dotSegments = dot.segments;
    const events = [...shots, ...burstGaps,
      ...reloads.map((reload) => ({ ...reload, type: reload.type === 'swap' ? 'magazine-transition' : 'reload', time: reload.start })),
      ...dot.events]
      .sort((a, b) => a.time - b.time);
    return { weapon, profile, pattern, shots, reloads, burstGaps, dotSegments, events, duration, knownUntil,
      dotStatus: !mechanics.dot ? 'none' : isVerifiedDot(mechanics.dot) ? 'modeled' : 'unknown',
      rounds, magazineCount, burstCount, warnings: [...new Set(warnings)],
      notes: mechanics.notes || [], source: mechanics.source };
  }

  function damageAt(timeline, time) {
    if (time < 0) return { direct: 0, burn: 0, total: 0, shots: 0, magazine: 1, burst: 1, activity: 'ready' };
    const t = Math.min(time, timeline.duration);
    let low = 0;
    let high = timeline.shots.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (timeline.shots[mid].time <= t + EPS) low = mid + 1;
      else high = mid;
    }
    const lastShot = timeline.shots[low - 1];
    const direct = lastShot?.cumulativeDirect || 0;
    const burn = timeline.dotSegments.reduce((sum, segment) => sum
      + Math.max(0, Math.min(t, segment.end) - segment.start) * segment.rate, 0);
    const transition = timeline.reloads.find((reload) => t >= reload.start - EPS && t < reload.end - EPS);
    return { direct, burn, total: direct + burn, shots: low,
      magazine: (lastShot?.magazineIndex || 0) + 1, burst: (lastShot?.burstIndex || 0) + 1,
      activity: transition ? transition.type : 'firing' };
  }

  function timelinePoints(timeline, end) {
    const limit = Math.min(end, timeline.duration, timeline.knownUntil);
    const times = [...new Set([0, limit, ...timeline.shots.map((s) => s.time),
      ...timeline.dotSegments.flatMap((s) => [s.start, s.end])])]
      .filter((t) => t <= limit + EPS).sort((a, b) => a - b);
    const shotTimes = new Map(timeline.shots.map((s) => [s.time, s]));
    let previousBurn = 0;
    return times.flatMap((time) => {
      const value = damageAt(timeline, time);
      const kind = value.burn > previousBurn + EPS ? 'dot' : 'hold';
      previousBurn = value.burn;
      const shot = shotTimes.get(time);
      return shot ? [{ time, damage: value.total - shot.damage, shots: shot.index - 1, kind },
        { time, damage: value.total, shots: shot.index, kind: 'shot' }]
        : [{ time, damage: value.total, shots: value.shots, kind }];
    });
  }

  function getKillTime(timeline, health) {
    let previous = { time: 0, damage: 0, shots: 0 };
    for (const point of timelinePoints(timeline, timeline.duration)) {
      if (point.damage >= health - EPS) {
        const time = point.kind === 'dot' && point.time > previous.time
          ? previous.time + (health - previous.damage) / (point.damage - previous.damage) * (point.time - previous.time)
          : point.time;
        return { time: Math.max(0, time), shots: point.shots, source: point.kind === 'dot' ? 'dot' : 'direct' };
      }
      previous = point;
    }
    return { time: Infinity, shots: Infinity, source: null };
  }

  function getClassKillTimes(timeline) {
    return Object.fromEntries(Object.entries(HEALTH).map(([name, hp]) => [name, getKillTime(timeline, hp)]));
  }

  function getHeadshotBreakpoints(weapon, options = {}) {
    return HIT_PATTERNS.map((pattern, headHits) => {
      const timeline = createWeaponTimeline(weapon, { ...options, headHits });
      return { headHits, pattern, ...getKillTime(timeline, options.health || HEALTH.Medium) };
    });
  }

  function getTimelineBounds(timelines, mode = 'Kill Window') {
    let end = mode === 'Full Damage' ? 6 : 1;
    timelines.forEach((timeline) => {
      const kill = getKillTime(timeline, HEALTH.Heavy);
      if (Number.isFinite(kill.time)) end = Math.max(end, kill.time + 0.3);
      if (mode === 'Full Damage' && timeline.reloads[0]) end = Math.max(end, timeline.reloads[0].end + 2);
    });
    const maxTime = Math.min(mode === 'Full Damage' ? 20 : 8, Math.ceil(end * 10) / 10);
    const maxDamage = mode === 'Full Damage' ? Math.max(350, ...timelines.map((timeline) =>
      damageAt(timeline, Math.min(maxTime, timeline.knownUntil)).total)) : 350;
    return { maxTime, maxY: mode === 'Full Damage' ? Math.ceil(maxDamage * 1.1 / 100) * 100 : 400 };
  }

  function exposureSummary(timeline) {
    const firstBurst = timeline.shots.filter((shot) => shot.burstIndex === 0);
    const last = firstBurst.at(-1);
    const reload = timeline.reloads[0];
    return { samples: [0.1, 0.25, 0.5, 1].map((time) => ({ time, ...damageAt(timeline, time) })),
      burstDamage: last ? damageAt(timeline, last.time).total : 0, burstDuration: last?.time || 0,
      beforeReload: reload ? damageAt(timeline, reload.start).total : null,
      reloadTime: reload?.start ?? null };
  }

  // Preserve Range DPS as firing-cycle DPS (not sustained/reload-adjusted DPS).
  // It uses the same scheduler with an unlimited magazine and includes steady DoT.
  function firingDPS(weapon, options = {}) {
    const mechanics = mechanicsFor(weapon);
    const timeline = createWeaponTimeline({ ...weapon, magazineRaw: Infinity, magazineSize: Infinity,
      magazineCount: 1, mechanics: { ...mechanics, magazine: undefined } }, { ...options, duration: 30 });
    // Measure a whole repeating hit-pattern AND burst cycle, never an averaged hit.
    let cycleHits = 6;
    while (cycleHits % timeline.burstCount) cycleHits += 6;
    const cycleTime = timeline.shots[cycleHits]?.time;
    if (!cycleTime) return NaN;
    const direct = timeline.shots[cycleHits - 1].cumulativeDirect / cycleTime;
    const end = Math.floor(timeline.duration / cycleTime) * cycleTime;
    const burn = (damageAt(timeline, end).burn - damageAt(timeline, end - cycleTime).burn) / cycleTime;
    return direct + burn;
  }

  const api = { HEALTH, WEAPON_MECHANICS_OVERRIDES, getHitPattern, parseMagazine, damageProfile, reloadDuration,
    createWeaponTimeline, damageAt, getKillTime, getClassKillTimes, getHeadshotBreakpoints,
    getTimelineBounds, timelinePoints, exposureSummary, firingDPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinalsCombat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
