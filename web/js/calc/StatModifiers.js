import { ELEMENTAL_TYPES } from "../data/GameDataRepository.js";

const ALL_ELEMENT_TYPES = [...ELEMENTAL_TYPES, "poison", "sleep", "paralysis", "blast"];

/** Accumulates every stat change that skills and buffs contribute to a build. */
export class StatModifiers {
  constructor() {
    this.attackFlat = 0;
    this.attackMultiplier = 1;
    this.affinity = 0;
    this.criticalDamageMultiplier = 1.25;
    this.criticalElementBonus = 0;
    this.elementFlat = Object.fromEntries(ALL_ELEMENT_TYPES.map((elementType) => [elementType, 0]));
    this.elementMultiplier = Object.fromEntries(ALL_ELEMENT_TYPES.map((elementType) => [elementType, 1]));
    this.defenseFlat = 0;
    this.defenseMultiplier = 1;
    this.resistanceFlat = Object.fromEntries(ELEMENTAL_TYPES.map((elementType) => [elementType, 0]));
    this.resistanceFloor = null;
    this.handicraftPoints = 0;
    this.bludgeonerThresholdIndex = -1;
    this.bludgeonerMultiplier = 1;
  }

  addAttack(flatBonus, percentBonus = 0) {
    this.attackFlat += flatBonus;
    this.attackMultiplier *= 1 + percentBonus;
  }

  addElement(elementTypes, flatBonus, percentBonus = 0) {
    elementTypes.forEach((elementType) => {
      this.elementFlat[elementType] += flatBonus;
      this.elementMultiplier[elementType] *= 1 + percentBonus;
    });
  }

  addDefense(flatBonus, percentBonus = 0) {
    this.defenseFlat += flatBonus;
    this.defenseMultiplier *= 1 + percentBonus;
  }

  addResistance(elementTypes, bonus) {
    elementTypes.forEach((elementType) => (this.resistanceFlat[elementType] += bonus));
  }

  static get allElementTypes() {
    return ALL_ELEMENT_TYPES;
  }
}
