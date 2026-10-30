import { ELEMENTAL_TYPES } from "../data/GameDataRepository.js";

const STATUS_TYPES = ["poison", "sleep", "paralysis", "blast"];

/**
 * How a single skill changes the stat sheet. `conditionLabel` is set for skills that only apply
 * in certain situations; the user can toggle those on or off in the skill sheet.
 */
class SkillEffect {
  constructor(applyToModifiers, conditionLabel = null) {
    this.applyToModifiers = applyToModifiers;
    this.conditionLabel = conditionLabel;
  }

  get isConditional() {
    return this.conditionLabel !== null;
  }

  apply(level, statModifiers) {
    this.applyToModifiers(level - 1, statModifiers);
  }
}

const elementAttackEffect = (elementType) =>
  new SkillEffect((levelIndex, modifiers) =>
    modifiers.addElement([elementType], [2, 3, 4, 4, 4][levelIndex], [0, 0, 0.05, 0.1, 0.2][levelIndex]),
  );

const statusAttackEffect = (statusType) =>
  new SkillEffect((levelIndex, modifiers) =>
    modifiers.addElement([statusType], [1, 2, 5][levelIndex], [0.05, 0.1, 0.2][levelIndex]),
  );

const resistanceEffect = (elementType) =>
  new SkillEffect((levelIndex, modifiers) => {
    modifiers.addResistance([elementType], [6, 12, 20][levelIndex]);
    if (levelIndex === 2) {
      modifiers.addDefense(10);
    }
  });

/**
 * Skill id -> effect. Values come from each skill's per-level detail text in the game data
 * (e.g. Attack Boost Lv4 "Attack +5% Bonus: +7").
 */
const SKILL_EFFECTS = new Map([
  // Attack Boost
  [0, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack([3, 6, 9, 7, 8, 9, 10][levelIndex], [0, 0, 0, 0.05, 0.06, 0.08, 0.1][levelIndex]))],
  // Agitator
  [1, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addAttack([4, 8, 12, 16, 20][levelIndex]);
    modifiers.affinity += [3, 5, 7, 10, 15][levelIndex];
  }, "Monster is enraged")],
  // Peak Performance
  [2, new SkillEffect((levelIndex, modifiers) => modifiers.addAttack([5, 10, 20][levelIndex]), "Health is full")],
  // Resentment
  [3, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack([5, 10, 15, 20, 25][levelIndex]), "Recoverable (red) health present")],
  // Resuscitate
  [4, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack([5, 10, 20][levelIndex]), "Afflicted by an abnormal status")],
  // Critical Eye
  [5, new SkillEffect((levelIndex, modifiers) => (modifiers.affinity += [5, 10, 15, 20, 25, 30, 40][levelIndex]))],
  // Critical Boost
  [6, new SkillEffect((levelIndex, modifiers) =>
    (modifiers.criticalDamageMultiplier = [1.3, 1.35, 1.4][levelIndex]))],
  // Weakness Exploit
  [7, new SkillEffect((levelIndex, modifiers) =>
    (modifiers.affinity += [15, 30, 50][levelIndex]), "Hitting a weak spot (hitzone 45+)")],
  // Latent Power
  [8, new SkillEffect((levelIndex, modifiers) =>
    (modifiers.affinity += [10, 20, 30, 40, 50][levelIndex]), "Latent Power triggered")],
  // Maximum Might
  [9, new SkillEffect((levelIndex, modifiers) =>
    (modifiers.affinity += [10, 20, 30][levelIndex]), "Stamina is full")],
  // Critical Element
  [10, new SkillEffect((levelIndex, modifiers) =>
    (modifiers.criticalElementBonus = [0.05, 0.1, 0.15][levelIndex]))],
  [12, elementAttackEffect("fire")],
  [13, elementAttackEffect("water")],
  [14, elementAttackEffect("ice")],
  [15, elementAttackEffect("thunder")],
  [16, elementAttackEffect("dragon")],
  [17, statusAttackEffect("poison")],
  [18, statusAttackEffect("paralysis")],
  [19, statusAttackEffect("sleep")],
  [20, statusAttackEffect("blast")],
  // Handicraft
  [21, new SkillEffect((levelIndex, modifiers) => (modifiers.handicraftPoints = (levelIndex + 1) * 10))],
  // Bludgeoner: applies when the sharpness bar tops out at yellow (lv1-2) or green (lv3) or lower
  [27, new SkillEffect((levelIndex, modifiers) => {
    modifiers.bludgeonerThresholdIndex = [2, 2, 3][levelIndex];
    modifiers.bludgeonerMultiplier = [1.05, 1.1, 1.1][levelIndex];
  })],
  // Offensive Guard
  [36, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack(0, [0.05, 0.1, 0.15][levelIndex]), "After a perfect guard")],
  // Critical Draw
  [37, new SkillEffect((levelIndex, modifiers) =>
    (modifiers.affinity += [10, 20, 40][levelIndex]), "Draw attacks")],
  // Defense Boost
  [55, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addDefense([5, 10, 10, 20, 20, 35, 35][levelIndex], [0, 0, 0.05, 0.05, 0.08, 0.08, 0.1][levelIndex]);
    modifiers.addResistance(ELEMENTAL_TYPES, [0, 0, 0, 3, 3, 5, 5][levelIndex]);
  })],
  [66, resistanceEffect("fire")],
  [67, resistanceEffect("water")],
  [68, resistanceEffect("ice")],
  [69, resistanceEffect("thunder")],
  [70, resistanceEffect("dragon")],
  // Heroics
  [90, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addDefense([50, 50, 100, 100, 0][levelIndex]);
    modifiers.addAttack(0, [0, 0.05, 0.05, 0.1, 0.3][levelIndex]);
  }, "Health at 35% or less")],
  // Fortify (one faint)
  [91, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addAttack(0, 0.1);
    modifiers.addDefense(0, 0.15);
  }, "After fainting once")],
  // Kushala Blessing
  [100, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addElement(["water", "ice"], 0, [0.05, 0.1, 0.1][levelIndex]))],
  // Teostra Blessing
  [101, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addElement(["fire", "blast"], 0, [0.05, 0.1, 0.1][levelIndex]))],
  // Dragonheart
  [102, new SkillEffect((levelIndex, modifiers) => {
    modifiers.resistanceFloor = [30, 50, 50, 50, 50][levelIndex];
    modifiers.addAttack(0, [0, 0, 0, 0.05, 0.1][levelIndex]);
  }, "Dragonblight active (low health)")],
  // Counterstrike
  [105, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack([10, 15, 25][levelIndex]), "After being knocked back")],
  // Wind Alignment / Thunder Alignment
  [108, new SkillEffect((levelIndex, modifiers) => modifiers.addResistance(["dragon"], levelIndex + 1))],
  [109, new SkillEffect((levelIndex, modifiers) => modifiers.addResistance(["thunder"], levelIndex + 1))],
  // Stormsoul
  [110, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addElement(["thunder", "dragon"], 0, [0.05, 0.1, 0.15, 0.15, 0.15][levelIndex]))],
  // Furious
  [202, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addDefense([10, 20, 30][levelIndex]);
    modifiers.addResistance(ELEMENTAL_TYPES, [5, 10, 20][levelIndex]);
  }, "Using the Red Swap Scroll")],
  // Coalescence
  [204, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addAttack([12, 15, 18][levelIndex]);
    modifiers.addElement(ELEMENTAL_TYPES, [2, 3, 4][levelIndex]);
    modifiers.addElement(STATUS_TYPES, 0, [0.05, 0.1, 0.15][levelIndex]);
  }, "Recovered from a blight or status")],
  // Defiance
  [206, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addDefense([0, 5, 10, 20, 30][levelIndex]), "Defiance active")],
  // Sneak Attack
  [207, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack(0, [0.05, 0.1, 0.2][levelIndex]), "Sneak attack")],
  // Adrenaline Rush
  [208, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack([10, 15, 30][levelIndex]), "After a successful evade/guard")],
  // Embolden
  [209, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addDefense([10, 20, 40][levelIndex]), "Embolden active")],
  // Foray
  [213, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addAttack([10, 10, 15][levelIndex]);
    modifiers.affinity += [0, 10, 20][levelIndex];
  }, "Monster is poisoned or blasted")],
  // Element Exploit
  [218, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addElement(ELEMENTAL_TYPES, 0, [0.1, 0.125, 0.15][levelIndex]), "Hitting a weak spot (hitzone 45+)")],
  // Burst (full stacks)
  [219, new SkillEffect((levelIndex, modifiers) => {
    modifiers.addAttack([10, 12, 15][levelIndex]);
    modifiers.addElement(ELEMENTAL_TYPES, [8, 10, 12][levelIndex]);
  }, "Burst at full stacks")],
  // Buildup Boost
  [224, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addAttack(0, [0.1, 0.15, 0.2][levelIndex]), "Monster afflicted by a status")],
  // Dragon Conversion
  [229, new SkillEffect((levelIndex, modifiers) =>
    modifiers.addResistance(ELEMENTAL_TYPES, [3, 5, 10][levelIndex]))],
]);

export class SkillEffectCatalog {
  static getEffect(skillId) {
    return SKILL_EFFECTS.get(skillId) ?? null;
  }

  static hasStatEffect(skillId) {
    return SKILL_EFFECTS.has(skillId);
  }
}
