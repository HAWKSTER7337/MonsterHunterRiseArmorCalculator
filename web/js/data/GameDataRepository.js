export const ARMOR_TYPES = ["head", "chest", "arms", "waist", "legs"];

export const ARMOR_TYPE_LABELS = {
  head: "Head",
  chest: "Chest",
  arms: "Arms",
  waist: "Waist",
  legs: "Legs",
};

export const ELEMENT_LABELS = {
  fire: "Fire",
  water: "Water",
  thunder: "Thunder",
  ice: "Ice",
  dragon: "Dragon",
  poison: "Poison",
  sleep: "Sleep",
  paralysis: "Paralysis",
  blast: "Blast",
};

export const ELEMENTAL_TYPES = ["fire", "water", "thunder", "ice", "dragon"];

/** Read-only, indexed access to the extracted game data. */
export class GameDataRepository {
  static async load(gameDataUrl, weaponRenderIndexUrl) {
    const [gameDataResponse, renderIndex] = await Promise.all([
      fetch(gameDataUrl),
      GameDataRepository.loadOptionalJson(weaponRenderIndexUrl),
    ]);
    if (!gameDataResponse.ok) {
      throw new Error(`Failed to load game data (${gameDataResponse.status})`);
    }
    return new GameDataRepository(await gameDataResponse.json(), renderIndex?.renders ?? {});
  }

  /** Weapon renders are optional extras: the planner works (with icons only) if the index is missing. */
  static async loadOptionalJson(url) {
    try {
      const response = await fetch(url);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  constructor(rawGameData, weaponRenderPathByModel = {}) {
    this.weaponRenderPathByModel = weaponRenderPathByModel;
    this.weaponTypes = rawGameData.weaponTypes;
    this.skills = rawGameData.skills;
    this.decorations = rawGameData.decorations;
    this.rampageSkills = rawGameData.rampageSkills;
    this.rampageDecorations = rawGameData.rampageDecorations;
    this.armor = rawGameData.armor;
    this.weapons = rawGameData.weapons;

    this.skillById = new Map(this.skills.map((skill) => [skill.id, skill]));
    this.decorationById = new Map(this.decorations.map((decoration) => [decoration.id, decoration]));
    this.rampageSkillById = new Map(this.rampageSkills.map((rampageSkill) => [rampageSkill.id, rampageSkill]));
    this.rampageDecorationById = new Map(
      this.rampageDecorations.map((rampageDecoration) => [rampageDecoration.id, rampageDecoration]),
    );
    this.armorById = new Map(this.armor.map((armorPiece) => [armorPiece.id, armorPiece]));
    this.weaponById = new Map(this.weapons.map((weapon) => [weapon.id, weapon]));
    this.weaponTypeNameByKey = new Map(this.weaponTypes.map((weaponType) => [weaponType.key, weaponType.name]));
    this.skillsSortedByName = [...this.skills].sort((first, second) => first.name.localeCompare(second.name));
  }

  getSkill(skillId) {
    return this.skillById.get(skillId) ?? null;
  }

  getDecoration(decorationId) {
    return this.decorationById.get(decorationId) ?? null;
  }

  getRampageSkill(rampageSkillId) {
    return this.rampageSkillById.get(rampageSkillId) ?? null;
  }

  getRampageDecoration(rampageDecorationId) {
    return this.rampageDecorationById.get(rampageDecorationId) ?? null;
  }

  getArmor(armorId) {
    return this.armorById.get(armorId) ?? null;
  }

  getWeapon(weaponId) {
    return this.weaponById.get(weaponId) ?? null;
  }

  /** URL of the in-game render for this weapon's model, or null when none was found. */
  getWeaponRenderUrl(weapon) {
    const renderPath = this.weaponRenderPathByModel[`${weapon.type}:${weapon.modelId}`];
    return renderPath ? `images/${renderPath}` : null;
  }

  getWeaponTypeName(weaponTypeKey) {
    return this.weaponTypeNameByKey.get(weaponTypeKey) ?? weaponTypeKey;
  }

  getArmorOfType(armorType) {
    return this.armor.filter((armorPiece) => armorPiece.type === armorType);
  }

  getWeaponsOfType(weaponTypeKey) {
    return this.weapons
      .filter((weapon) => weapon.type === weaponTypeKey)
      .sort((first, second) => first.rarity - second.rarity || first.sortId - second.sortId);
  }

  getDecorationsFittingSlot(slotLevel) {
    return this.decorations.filter((decoration) => decoration.slotLevel <= slotLevel);
  }

  getRampageDecorationsFittingSlot(slotLevel, weaponTypeKey) {
    return this.rampageDecorations.filter(
      (rampageDecoration) =>
        rampageDecoration.slotLevel <= slotLevel && rampageDecoration.weaponTypes.includes(weaponTypeKey),
    );
  }

  describeSkillList(skillLevels) {
    return skillLevels
      .map(({ skillId, level }) => `${this.getSkill(skillId)?.name ?? "?"} ${level}`)
      .join(", ");
  }
}
