import { DecorationSocket } from "./DecorationSocket.js";

// Every armor buildup table in the game data raises defense by 2 per upgrade level.
const DEFENSE_PER_UPGRADE_LEVEL = 2;

/** An armor piece the hunter is wearing, with its decoration sockets and upgrade level. */
export class EquippedArmor {
  constructor(armorData, upgradeLevel = null) {
    this.armorData = armorData;
    this.sockets = DecorationSocket.fromSlotLevels(armorData.slots);
    this.setUpgradeLevel(upgradeLevel ?? this.maxUpgradeLevel);
  }

  get innateSkills() {
    return this.armorData.skills;
  }

  get maxUpgradeLevel() {
    return 1 + Math.ceil((this.armorData.maxDefense - this.armorData.defense) / DEFENSE_PER_UPGRADE_LEVEL);
  }

  get currentDefense() {
    const upgradeBonus = (this.upgradeLevel - 1) * DEFENSE_PER_UPGRADE_LEVEL;
    return Math.min(this.armorData.defense + upgradeBonus, this.armorData.maxDefense);
  }

  setUpgradeLevel(upgradeLevel) {
    this.upgradeLevel = Math.max(1, Math.min(this.maxUpgradeLevel, Math.round(Number(upgradeLevel) || 1)));
  }
}

/** The equipped weapon, with regular decoration sockets, rampage sockets and an optional rampage skill. */
export class EquippedWeapon {
  constructor(weaponData) {
    this.weaponData = weaponData;
    this.sockets = DecorationSocket.fromSlotLevels(weaponData.slots);
    this.rampageSockets = DecorationSocket.fromSlotLevels(weaponData.rampageSlots);
    this.selectedRampageSkillId = null;
  }

  get innateSkills() {
    return [];
  }

  selectRampageSkill(rampageSkillId) {
    this.selectedRampageSkillId = this.weaponData.rampageSkills.includes(rampageSkillId) ? rampageSkillId : null;
  }
}

/** A user-defined talisman: up to two skills plus up to three decoration slots. */
export class Talisman {
  static MAX_SKILLS = 2;
  static MAX_SLOTS = 3;

  constructor() {
    this.skillLevels = [];
    this.sockets = [];
  }

  get innateSkills() {
    return this.skillLevels;
  }

  setSkillLevels(skillLevels) {
    this.skillLevels = skillLevels.filter((skillLevel) => skillLevel.skillId !== null && skillLevel.level > 0);
  }

  /** Changes slot levels while keeping decorations that still fit their slot. */
  setSlotLevels(slotLevels, lookupDecoration) {
    const previousDecorationIds = this.sockets.map((socket) => socket.decorationId);
    this.sockets = DecorationSocket.fromSlotLevels(slotLevels.filter((slotLevel) => slotLevel > 0));
    DecorationSocket.restoreDecorations(this.sockets, previousDecorationIds, lookupDecoration);
  }

  get slotLevels() {
    return this.sockets.map((socket) => socket.slotLevel);
  }
}
