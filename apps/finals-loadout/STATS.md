# Weapon comparison model

The existing Krome JSONP/CSV integration supplies direct damage, RPM, burst
count/delay, falloff and reloads. `weapon-timeline.js` is a dependency-free pure
calculation module shared by the Range and Damage Timeline views.

## Timing and probabilities

- First connecting hit is at zero. Handling, accuracy, travel time and target
  movement are excluded. Shotgun entries assume the listed full-shot damage.
- Krome's RPM is intra-burst RPM: the live 11.9.0 sheet supplies 1000 for 93R and
  1080 for FAMAS. Its burst delay is applied after the burst's final bullet.
  Range fields are mapped by heading because the sheet added a Stamina column.
- Reloads and linked-magazine swaps replace the normal next-shot interval.
  `magazineRaw` preserves values such as `30x2`; missing capacity is not treated
  as infinite ammo. GViz sometimes drops text cells in numeric columns.
- Body/Head use real scheduled hits. Mixed advances the exact probability mass
  of surviving head/body outcomes over those same events. First-kill probability
  times event time gives expected TTK. This is equivalent to the binomial CDF for
  constant direct hits, without rounding expected damage into imaginary bullets.
- Continuous DoT is integrated over intervals. It can kill between shots, also
  in Mixed mode. The mechanics interface supports hit-triggered or predicate-
  triggered effects, delay, refresh, replace and capped stacking. DoT triggers
  must be independent of the random head/body outcome.
- Mixed lines show expected damage; diamond markers show the earliest time
  with at least 50% kill probability, not a guaranteed kill or the crossing of
  the expected-damage curve. Hover/pinned details include all three HP classes.
- Range DPS retains firing-cycle semantics (no reload downtime), using the
  shared schedule and steady burn contribution. Timeline includes reloads.
- Calculations use a 60-second horizon, separate from the 3-to-8-second display
  window. Unresolved kills are N/A, not a conditional average of known outcomes.
  Missing timing/capacity is flagged per weapon; unknown future shots aren't
  drawn. Pinning extends the time window for relevant reloads, capped at 8s.

## Mechanics overrides and evidence

Checked against the live sheet and wiki on September 30, 2026. Sheet direct
stats and supplied full-empty reloads take priority over wiki values.

- [Cerberus 12GA](https://www.thefinals.wiki/wiki/Cerberus_12GA): no headshots;
  15 burn damage/second for approximately 2 seconds, nonstacking refresh.
  Assumes a full connecting shot ignites; actual ignition requires enough
  pellets. Segmented reload extension provides 2.1s/2.25s for one/two missing
  shells. Full-empty combat uses the sheet (currently 2.95s), with the wiki's
  2.85s only as a fallback if the sheet has no value.
- [ARN-220](https://www.thefinals.wiki/wiki/ARN-220): two linked 30-round mags;
  requested wiki swap 0.66s, full-empty fallback 2.7s, tactical fallback 2.45s.
  **Unresolved source disagreement:** the live sheet note says 0.80s quick swap.
  The app exposes this discrepancy in model assumptions; it does not silently
  present the timings as agreed. Supplied sheet reload fields still win.
- [Flamethrower](https://www.thefinals.wiki/wiki/Flamethrower): no headshots,
  7.4m reach. Known burn rate is 15/s, but burn duration, onset and refresh
  behavior could not be verified. The sheet itself flags uncertainty. The
  override explicitly needs data and **only direct damage is simulated**.
  The Fire page's surface-fire duration is not substituted for weapon afterburn.
- SA1216: an explicit needs-data entry for linked-magazine capacity/transitions
  when absent from the sheet. No guessed reload or unlimited-magazine schedule.
- M134 Minigun: the sheet's fully spun-up cadence, with an explicit assumption.
  Initial spin-up is excluded rather than inventing a ramp curve.

Other rows without cadence (currently several melee attacks) are individually
flagged; a known first hit may still kill, but follow-up timings remain unknown.

## Tests

From the repository root:

```sh
node --test apps/finals-loadout/weapon-timeline.test.js apps/finals-loadout/weapon-stats-parser.test.js
```

Regression examples at 0m against Medium: ARN-220 Body = 1.12s; Mixed 35%
ARN-220 = 0.965903s and 93R = 0.997154s. Tests also cover burst boundaries,
reloads, linked magazines, DoT refresh/stack/delay, between-shot kills, exact
probabilities, exposure snapshots, parser column shifts and unknown mechanics.
