// The campaign: the eight districts, the wheel of weapons, and what the
// machine remembers about you.
//
// The select screen is a 3x3 grid -- eight districts around the edge, the
// Citadel sealed in the center until every warden is down. This module is the
// grid's truth: which cell is which district, which level realizes it, which
// weapon its warden holds. Districts whose levels are not built yet sit dark
// in the grid, which is honest: the map shows the whole campaign, including
// the parts that are still coming.
//
// Progress is remembered in localStorage: which levels are cleared, which
// weapons are earned, which one is fitted. Clearing is forever; replaying a
// cleared district is allowed and changes nothing you already have.

/**
 * The wheel, in its own order. `built` is which shots exist in code today.
 * The copy is the armory's truth: `does` is the weapon in one line, `how` is
 * the mechanics in the player's hands, `from` names the warden who wields it
 * against you before you take it, and `melts` is the wheel relation -- the
 * next warden over, to whom this weapon is the answer.
 */
export const WEAPONS = {
  wave: {
    name: 'WAVE', css: '#4fd8ff', built: false,
    from: 'HYDRA', district: 'RIVERWORKS', melts: 'FURNACE',
    does: 'A RISING WALL OF LIGHT THAT SWEEPS THE TRENCH',
    how: 'HOLD SPECIAL: THE WALL CLIMBS FROM THE FLOOR AND ROLLS FORWARD, TAKING EVERYTHING WIDE. AIM IS THE TRENCH ITSELF.',
  },
  magma: {
    name: 'MAGMA', css: '#ff7a3c', built: false,
    from: 'FURNACE', district: 'REACTOR', melts: 'MANTIS',
    does: 'SHORT-RANGE BURNING FLAK THAT HANGS AND KEEPS BURNING',
    how: 'HOLD SPECIAL: SHELLS BURST INTO CLOUDS THAT STAY WHERE THEY POPPED. WHAT FLIES THROUGH ONE COOKS. ARMOR HATES IT.',
  },
  saw: {
    name: 'SAW', css: '#7dff6a', built: false,
    from: 'MANTIS', district: 'OVERGROWTH', melts: 'MARIONETTE',
    does: 'A THROWN BLADE THAT COMES BACK',
    how: 'HOLD SPECIAL: THE BLADE FLIES OUT, CARVES WHAT IT CROSSES, AND RETURNS ALONG A SECOND LINE. TWO PASSES PER THROW.',
  },
  arc: {
    name: 'ARC', css: '#b06fff', built: true,
    from: 'MARIONETTE', district: 'NEON', melts: 'PORTCULLIS',
    does: 'CHAIN LIGHTNING THAT JUMPS BETWEEN YOUR LOCKS',
    how: 'HOLD SPECIAL: THE BOLT STARTS AT THE TARGET NEAREST THE CROSSHAIR AND JUMPS UP TO THREE TIMES, EACH LANDING SOFTER. PAINT MORE LOCKS, FEED THE CHAIN.',
  },
  breach: {
    name: 'BREACH', css: '#a8b8c8', built: false,
    from: 'PORTCULLIS', district: 'BULKHEAD', melts: 'AVALANCHE',
    does: 'A CHARGE SHOT THAT DETONATES BEHIND WHAT IT HITS',
    how: 'HOLD SPECIAL: ONE HEAVY ROUND. THE BLAST THROWS FORWARD THROUGH THE POINT OF IMPACT -- DOORS OPEN EARLY, PRESSES STAGGER.',
  },
  freeze: {
    name: 'FREEZE', css: '#bfe8ff', built: false,
    from: 'AVALANCHE', district: 'GLACIER', melts: 'BROADSIDE',
    does: 'A BEAM THAT STOPS MACHINERY MID-MOTION',
    how: 'HOLD SPECIAL: WHATEVER THE BEAM TOUCHES WINDS DOWN -- PINWHEELS STALL, PRESSES HALT MID-CYCLE, GUNS FORGET THEIR TIMING.',
  },
  rail: {
    name: 'RAIL', css: '#ffd24f', built: false,
    from: 'BROADSIDE', district: 'GAUNTLET', melts: 'REVENANT',
    does: 'A PIERCING LANCE THROUGH EVERYTHING IN A LINE',
    how: 'HOLD SPECIAL: ONE INSTANT LINE, NO TRAVEL TIME, THROUGH EVERY TARGET IT CROSSES. LINE THEM UP AND SPEND IT ONCE.',
  },
  ghost: {
    name: 'GHOST', css: '#ff6fd8', built: false,
    from: 'REVENANT', district: 'VOID', melts: 'HYDRA',
    does: 'A SHOT THAT PASSES THROUGH WALLS',
    how: 'HOLD SPECIAL: THE ROUND IGNORES TERRAIN AND HULL ALIKE AND HITS WHAT HIDES BEHIND THEM. COVER STOPS MEANING ANYTHING.',
  },
};

/** The standard fit, for the armory's first page. Not on the wheel: always loaded. */
export const MACHINE_GUN = {
  name: 'MACHINE GUN', css: '#9be8c8',
  does: 'TWIN GUNS. INFINITE AMMO, FINITE PATIENCE.',
  how: 'HOLD FIRE: SHOTS GO THROUGH THE CROSSHAIR, HEAT BUILDS, OVERHEAT COOLS OFF. EVERYTHING IN THE CAMPAIGN FALLS TO IT -- SPECIALS MULTIPLY, THE GUN FINISHES.',
};

/**
 * The grid, row-major. `level` names an entry in PREBUILT, or null for a
 * district that is designed but not yet built. The center is the Citadel.
 */
// Every district owns a band of the hue wheel, and nobody shares:
// REACTOR red 0.0-0.06, GAUNTLET gold 0.13-0.16, OVERGROWTH green 0.30-0.36,
// RIVERWORKS cyan 0.48-0.53, GLACIER ice 0.56-0.60, BULKHEAD steel 0.63-0.66,
// NEON violet 0.74-0.86, VOID magenta 0.90-0.94. The Citadel takes them all.
export const DISTRICTS = [
  { id: 'riverworks', name: 'RIVERWORKS', level: 'THE ESSES',     weapon: 'ghost',  css: '#4fd8ff' },
  { id: 'reactor',    name: 'REACTOR',    level: 'REACTOR',       weapon: 'wave',   css: '#ff5a3c' },
  { id: 'overgrowth', name: 'OVERGROWTH', level: 'CANOPY RUN',    weapon: 'magma',  css: '#7dff6a' },
  { id: 'neon',       name: 'NEON',       level: 'NEON DISTRICT', weapon: 'saw',    css: '#b06fff' },
  { id: 'citadel',    name: 'CITADEL',    level: null,            weapon: null,     css: '#ffffff', center: true },
  { id: 'bulkhead',   name: 'BULKHEAD',   level: 'BULKHEAD RUN',  weapon: 'arc',    css: '#6f9fe6' },
  { id: 'glacier',    name: 'GLACIER',    level: 'THE SHEAR',     weapon: 'breach', css: '#cfeeff' },
  { id: 'gauntlet',   name: 'GAUNTLET',   level: 'GAUNTLET',      weapon: 'freeze', css: '#ffd24f' },
  { id: 'void',       name: 'VOID',       level: 'DEAD AIR',      weapon: 'rail',   css: '#ff4fd8' },
];
// A cell's `weapon` is what its warden is WEAK to, per the wheel; the weapon
// you TAKE from a district is the one its own warden fights with, which is
// stored on the level's boss spec. Both matter to the screen: the cell tint
// is the district; the earn is the warden's.

const KEY = 'vectrench.campaign.v1';

/** What the machine remembers. One instance, owned by the UI. */
export class Campaign {
  constructor() {
    this.cleared = {};      // level name -> true, forever
    this.weapons = [];      // earned, in the order they were taken
    this.equipped = null;   // one of this.weapons, or null before any
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      this.cleared = raw.cleared || {};
      this.weapons = (raw.weapons || []).filter((w) => WEAPONS[w]);
      // null is a real choice -- the machine gun, fitted on purpose -- and it
      // survives a reload. Only an *invalid* save falls back to the first earn.
      this.equipped = raw.equipped === null ? null
        : WEAPONS[raw.equipped] && this.weapons.includes(raw.equipped)
          ? raw.equipped : this.weapons[0] || null;
    } catch { /* first run, or storage denied: start clean */ }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        cleared: this.cleared, weapons: this.weapons, equipped: this.equipped,
      }));
    } catch { /* private mode: the run still works, it is just forgotten */ }
  }

  isCleared(name) {
    return !!this.cleared[name];
  }

  /** Every district with a level, cleared. The Citadel's precondition. */
  wardensDown() {
    return DISTRICTS.filter((d) => d.level && !d.center)
      .every((d) => this.isCleared(d.level));
  }

  clearedCount() {
    return DISTRICTS.filter((d) => d.level && !d.center && this.isCleared(d.level)).length;
  }

  /**
   * A won run, recorded. Returns what was new: `{ first, weapon }` -- weapon
   * is set only the first time a warden falls and hands its armament over.
   */
  markCleared(spec) {
    const first = !this.cleared[spec.name];
    this.cleared[spec.name] = true;
    let weapon = null;
    const held = spec.boss && spec.boss.weapon;
    if (held && WEAPONS[held] && !this.weapons.includes(held)) {
      this.weapons.push(held);
      if (!this.equipped && WEAPONS[held].built) this.equipped = held;
      weapon = held;
    }
    this.save();
    return { first, weapon };
  }

  /** Fit a weapon -- an earned one, or null for the plain machine gun. */
  equip(w) {
    if (w !== null && !this.weapons.includes(w)) return false;
    this.equipped = w;
    this.save();
    return true;
  }
}
