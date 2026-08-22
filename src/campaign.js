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

/** The wheel, in its own order. `built` is which shots exist in code today. */
export const WEAPONS = {
  wave:   { name: 'WAVE',   css: '#4fd8ff', built: false },
  magma:  { name: 'MAGMA',  css: '#ff7a3c', built: false },
  saw:    { name: 'SAW',    css: '#7dff6a', built: false },
  arc:    { name: 'ARC',    css: '#b06fff', built: true },
  breach: { name: 'BREACH', css: '#a8b8c8', built: false },
  freeze: { name: 'FREEZE', css: '#bfe8ff', built: false },
  rail:   { name: 'RAIL',   css: '#ffd24f', built: false },
  ghost:  { name: 'GHOST',  css: '#ff6fd8', built: false },
};

/**
 * The grid, row-major. `level` names an entry in PREBUILT, or null for a
 * district that is designed but not yet built. The center is the Citadel.
 */
export const DISTRICTS = [
  { id: 'riverworks', name: 'RIVERWORKS',   level: 'THE ESSES',     weapon: 'ghost',  css: '#4fd8ff' },
  { id: 'foundry',    name: 'FOUNDRY',      level: 'REACTOR',       weapon: 'wave',   css: '#ff7a3c' },
  { id: 'overgrowth', name: 'OVERGROWTH',   level: null,            weapon: 'magma',  css: '#7dff6a' },
  { id: 'neon',       name: 'NEON DISTRICT', level: 'NEON DISTRICT', weapon: 'saw',   css: '#b06fff' },
  { id: 'citadel',    name: 'THE CITADEL',  level: null,            weapon: null,     css: '#ffffff', center: true },
  { id: 'freight',    name: 'FREIGHT LOCKS', level: 'BULKHEAD RUN', weapon: 'arc',    css: '#a8b8c8' },
  { id: 'glacier',    name: 'GLACIER',      level: null,            weapon: 'breach', css: '#bfe8ff' },
  { id: 'gauntlet',   name: 'THE GAUNTLET', level: 'GAUNTLET',      weapon: 'freeze', css: '#ffd24f' },
  { id: 'thenull',    name: 'THE NULL',     level: null,            weapon: 'rail',   css: '#ff6fd8' },
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
      this.equipped = WEAPONS[raw.equipped] && this.weapons.includes(raw.equipped)
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
      if (!this.equipped) this.equipped = held;
      weapon = held;
    }
    this.save();
    return { first, weapon };
  }

  /** Fit a weapon. Only earned ones; returns whether it took. */
  equip(w) {
    if (!this.weapons.includes(w)) return false;
    this.equipped = w;
    this.save();
    return true;
  }
}
