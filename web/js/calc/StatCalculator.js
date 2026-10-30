import { ARMOR_TYPES, ELEMENTAL_TYPES } from "../data/GameDataRepository.js";
import { SharpnessCalculator } from "./SharpnessCalculator.js";
import { SkillAggregator } from "./SkillAggregator.js";
import { StatModifiers } from "./StatModifiers.js";

const ITEM_BUFF_VALUES = {
  powercharm: 6,
  powertalon: 9,
  armorcharm: 12,
  armortalon: 18,
};

const NEGATIVE_CRITICAL_MULTIPLIER = 0.75;
const RAMPAGE_RULE_ELEMENTS = {
  ElementFire: "fire",
  ElementWater: "water",
  ElementThunter: "thunder",
  ElementIce: "ice",
  ElementDragon: "dragon",
  ElementPoison: "poison",
  ElementParalyze: "paralysis",
  ElementSleep: "sleep",
  ElementBomb: "blast",
};

/** Applies a weapon's rampage skills (chosen skill and rampage decorations) to its base stats. */
class RampageSkillApplier {
  constructor(gameDataRepository) {
    this.gameDataRepository = gameDataRepository;
  }

  collectRampageSkills(equippedWeapon) {
    const rampageSkills = [];
    const selectedRampageSkill = this.gameDataRepository.getRampageSkill(equippedWeapon.selectedRampageSkillId);
    if (selectedRampageSkill) {
      rampageSkills.push({ rampageSkill: selectedRampageSkill, sourceName: "Rampage Skill" });
    }
    equippedWeapon.rampageSockets.forEach((socket) => {
      const rampageDecoration = this.gameDataRepository.getRampageDecoration(socket.decorationId);
      const rampageSkill = rampageDecoration && this.gameDataRepository.getRampageSkill(rampageDecoration.rampageSkillId);
      if (rampageSkill) {
        rampageSkills.push({ rampageSkill, sourceName: rampageDecoration.name });
      }
    });
    return rampageSkills;
  }

  /** Returns adjusted weapon stats plus whether each rampage skill's requirement was met. */
  apply(equippedWeapon) {
    const weaponData = equippedWeapon.weaponData;
    const adjustedStats = {
      attack: weaponData.attack,
      affinity: weaponData.affinity,
      defenseBonus: weaponData.defenseBonus,
      element: weaponData.element && { ...weaponData.element },
      subElement: weaponData.subElement && { ...weaponData.subElement },
    };
    const appliedRampageSkills = this.collectRampageSkills(equippedWeapon).map(({ rampageSkill, sourceName }) => {
      const isActive = this.meetsRequirement(rampageSkill, adjustedStats);
      if (isActive) {
        this.applyRampageSkill(rampageSkill, adjustedStats);
      }
      return { rampageSkill, sourceName, isActive };
    });
    return { adjustedStats, appliedRampageSkills };
  }

  meetsRequirement(rampageSkill, weaponStats) {
    const mainElementType = weaponStats.element?.type ?? null;
    switch (rampageSkill.applyRule) {
      case "ElementNone":
        return mainElementType === null;
      case "ElementFirstGroup":
        return ELEMENTAL_TYPES.includes(mainElementType);
      case "ElementNotEqualMain":
        return rampageSkill.overwriteSubElement?.type !== mainElementType;
      default:
        return RAMPAGE_RULE_ELEMENTS[rampageSkill.applyRule]
          ? RAMPAGE_RULE_ELEMENTS[rampageSkill.applyRule] === mainElementType
          : true;
    }
  }

  applyRampageSkill(rampageSkill, weaponStats) {
    weaponStats.element = this.overwriteElement(weaponStats.element, rampageSkill.overwriteMainElement);
    weaponStats.subElement = this.overwriteElement(weaponStats.subElement, rampageSkill.overwriteSubElement);
    weaponStats.attack += rampageSkill.attack;
    weaponStats.affinity += rampageSkill.affinity;
    weaponStats.defenseBonus += rampageSkill.defense;
    if (weaponStats.element) {
      weaponStats.element.value += rampageSkill.mainElement;
    }
    if (weaponStats.subElement) {
      weaponStats.subElement.value += rampageSkill.subElement;
    }
  }

  overwriteElement(currentElement, overwrite) {
    if (!overwrite) {
      return currentElement;
    }
    const keptValue = currentElement?.type === overwrite.type ? currentElement.value : 0;
    return { type: overwrite.type, value: keptValue + overwrite.value };
  }
}

/** Turns a Build into the full stat sheet shown on screen, following Monster Hunter Rise damage math. */
export class StatCalculator {
  constructor(gameDataRepository) {
    this.gameDataRepository = gameDataRepository;
    this.skillAggregator = new SkillAggregator(gameDataRepository);
    this.rampageSkillApplier = new RampageSkillApplier(gameDataRepository);
  }

  calculate(build) {
    const activeSkills = this.skillAggregator.aggregate(build);
    const statModifiers = this.buildModifiers(build, activeSkills);
    const weaponStats = this.calculateWeaponStats(build, statModifiers);
    return {
      activeSkills,
      weapon: weaponStats,
      defense: this.calculateDefense(build, statModifiers, weaponStats),
      resistances: this.calculateResistances(build, statModifiers),
    };
  }

  buildModifiers(build, activeSkills) {
    const statModifiers = new StatModifiers();
    activeSkills.forEach((activeSkill) => {
      const isApplied = activeSkill.effect && activeSkill.effectiveLevel > 0
        && (!activeSkill.effect.isConditional || build.isConditionActive(activeSkill.skillData.id));
      if (isApplied) {
        activeSkill.effect.apply(activeSkill.effectiveLevel, statModifiers);
      }
    });
    return statModifiers;
  }

  calculateWeaponStats(build, statModifiers) {
    if (!build.weapon) {
      return null;
    }
    const weaponData = build.weapon.weaponData;
    const { adjustedStats, appliedRampageSkills } = this.rampageSkillApplier.apply(build.weapon);
    const sharpnessBar = SharpnessCalculator.calculate(
      weaponData.sharpness, weaponData.handicraft, statModifiers.handicraftPoints,
    );

    let attackMultiplier = statModifiers.attackMultiplier;
    const isBludgeonerActive = sharpnessBar !== null && statModifiers.bludgeonerThresholdIndex >= 0
      && sharpnessBar.topColorIndex <= statModifiers.bludgeonerThresholdIndex;
    if (isBludgeonerActive) {
      attackMultiplier *= statModifiers.bludgeonerMultiplier;
    }

    const buffs = build.buffSettings;
    const itemAttackBonus = (buffs.powercharm ? ITEM_BUFF_VALUES.powercharm : 0)
      + (buffs.powertalon ? ITEM_BUFF_VALUES.powertalon : 0)
      + Number(buffs.petalaceAttack || 0);
    const attack = Math.round(adjustedStats.attack * attackMultiplier + statModifiers.attackFlat + itemAttackBonus);
    const affinity = Math.max(-100, Math.min(100, adjustedStats.affinity + statModifiers.affinity));
    const criticalDamageMultiplier = statModifiers.criticalDamageMultiplier;

    const element = this.applyElementModifiers(adjustedStats.element, statModifiers);
    const subElement = this.applyElementModifiers(adjustedStats.subElement, statModifiers);
    const rawSharpnessMultiplier = sharpnessBar?.rawMultiplier ?? 1;
    const elementSharpnessMultiplier = sharpnessBar?.elementMultiplier ?? 1;

    return {
      weaponData,
      weaponTypeName: this.gameDataRepository.getWeaponTypeName(weaponData.type),
      baseAttack: weaponData.attack,
      attack,
      affinity,
      criticalDamageMultiplier,
      element,
      subElement,
      sharpnessBar,
      rawSharpnessMultiplier,
      elementSharpnessMultiplier,
      effectiveRaw: attack * rawSharpnessMultiplier * this.rawCriticalFactor(affinity, criticalDamageMultiplier),
      effectiveElement: this.effectiveElement(element, affinity, elementSharpnessMultiplier, statModifiers),
      effectiveSubElement: this.effectiveElement(subElement, affinity, elementSharpnessMultiplier, statModifiers),
      appliedRampageSkills,
      defenseBonus: adjustedStats.defenseBonus,
      isBludgeonerActive,
    };
  }

  applyElementModifiers(weaponElement, statModifiers) {
    if (!weaponElement) {
      return null;
    }
    const value = Math.round(
      weaponElement.value * statModifiers.elementMultiplier[weaponElement.type] + statModifiers.elementFlat[weaponElement.type],
    );
    return { type: weaponElement.type, baseValue: weaponElement.value, value };
  }

  rawCriticalFactor(affinity, criticalDamageMultiplier) {
    const criticalChance = Math.abs(affinity) / 100;
    return affinity >= 0
      ? 1 + criticalChance * (criticalDamageMultiplier - 1)
      : 1 - criticalChance * (1 - NEGATIVE_CRITICAL_MULTIPLIER);
  }

  /** Element is unaffected by negative affinity; positive crits only add element via Critical Element. */
  effectiveElement(element, affinity, elementSharpnessMultiplier, statModifiers) {
    if (!element || !ELEMENTAL_TYPES.includes(element.type)) {
      return null;
    }
    const criticalElementFactor = 1 + (Math.max(0, affinity) / 100) * statModifiers.criticalElementBonus;
    return element.value * elementSharpnessMultiplier * criticalElementFactor;
  }

  calculateDefense(build, statModifiers, weaponStats) {
    const buffs = build.buffSettings;
    const armorDefense = ARMOR_TYPES.reduce(
      (total, armorType) => total + (build.armorByType[armorType]?.currentDefense ?? 0),
      0,
    );
    const itemDefenseBonus = (buffs.armorcharm ? ITEM_BUFF_VALUES.armorcharm : 0)
      + (buffs.armortalon ? ITEM_BUFF_VALUES.armortalon : 0)
      + Number(buffs.petalaceDefense || 0);
    const weaponDefenseBonus = weaponStats?.defenseBonus ?? 0;
    const baseDefense = armorDefense + weaponDefenseBonus + itemDefenseBonus;
    return {
      armorDefense,
      weaponDefenseBonus,
      itemDefenseBonus,
      total: Math.round(baseDefense * statModifiers.defenseMultiplier + statModifiers.defenseFlat),
    };
  }

  calculateResistances(build, statModifiers) {
    return Object.fromEntries(
      ELEMENTAL_TYPES.map((elementType) => {
        const armorResistance = ARMOR_TYPES.reduce(
          (total, armorType) => total + (build.armorByType[armorType]?.armorData.resistances[elementType] ?? 0),
          0,
        );
        const resistance = armorResistance + statModifiers.resistanceFlat[elementType];
        const hasFloor = statModifiers.resistanceFloor !== null;
        return [elementType, hasFloor ? Math.max(resistance, statModifiers.resistanceFloor) : resistance];
      }),
    );
  }
}
