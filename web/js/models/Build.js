import { ARMOR_TYPES } from "../data/GameDataRepository.js";
import { DecorationSocket } from "./DecorationSocket.js";
import { EquippedArmor, EquippedWeapon, Talisman } from "./Equipment.js";

export const BUILD_CHANGE_REASONS = {
  general: "general",
  armorUpgrade: "armorUpgrade",
};

export const DEFAULT_BUFF_SETTINGS = {
  powercharm: true,
  powertalon: true,
  armorcharm: true,
  armortalon: true,
  petalaceAttack: 0,
  petalaceDefense: 0,
};

/** A complete hunter loadout: weapon, five armor pieces, talisman, buffs and skill condition toggles. */
export class Build {
  constructor(gameDataRepository) {
    this.gameDataRepository = gameDataRepository;
    this.weapon = null;
    this.armorByType = Object.fromEntries(ARMOR_TYPES.map((armorType) => [armorType, null]));
    this.talisman = new Talisman();
    this.buffSettings = { ...DEFAULT_BUFF_SETTINGS };
    this.inactiveConditionalSkillIds = new Set();
    this.changeListeners = [];
  }

  onChange(listener) {
    this.changeListeners.push(listener);
  }

  notifyChanged(changeReason = BUILD_CHANGE_REASONS.general) {
    this.changeListeners.forEach((listener) => listener(this, changeReason));
  }

  /** Every piece that can carry decorations, in display order. */
  get equippedPieces() {
    return [this.weapon, ...ARMOR_TYPES.map((armorType) => this.armorByType[armorType]), this.talisman].filter(Boolean);
  }

  equipWeapon(weaponData) {
    this.weapon = weaponData ? new EquippedWeapon(weaponData) : null;
    this.notifyChanged();
  }

  equipArmor(armorType, armorData) {
    this.armorByType[armorType] = armorData ? new EquippedArmor(armorData) : null;
    this.notifyChanged();
  }

  setArmorUpgradeLevel(armorType, upgradeLevel) {
    this.armorByType[armorType]?.setUpgradeLevel(upgradeLevel);
    this.notifyChanged(BUILD_CHANGE_REASONS.armorUpgrade);
  }

  /** Sets every equipped piece to its base (level 1) or fully upgraded defense. */
  setAllArmorUpgraded(isFullyUpgraded) {
    ARMOR_TYPES.forEach((armorType) => {
      const equippedArmor = this.armorByType[armorType];
      equippedArmor?.setUpgradeLevel(isFullyUpgraded ? equippedArmor.maxUpgradeLevel : 1);
    });
    this.notifyChanged();
  }

  setDecoration(socket, decoration) {
    if (decoration) {
      socket.insert(decoration);
    } else {
      socket.clear();
    }
    this.notifyChanged();
  }

  selectRampageSkill(rampageSkillId) {
    this.weapon?.selectRampageSkill(rampageSkillId);
    this.notifyChanged();
  }

  updateTalisman(skillLevels, slotLevels) {
    this.talisman.setSkillLevels(skillLevels);
    this.talisman.setSlotLevels(slotLevels, (decorationId) => this.gameDataRepository.getDecoration(decorationId));
    this.notifyChanged();
  }

  updateBuffSetting(settingName, value) {
    this.buffSettings[settingName] = value;
    this.notifyChanged();
  }

  isConditionActive(skillId) {
    return !this.inactiveConditionalSkillIds.has(skillId);
  }

  setConditionActive(skillId, isActive) {
    if (isActive) {
      this.inactiveConditionalSkillIds.delete(skillId);
    } else {
      this.inactiveConditionalSkillIds.add(skillId);
    }
    this.notifyChanged();
  }

  clearAllDecorations() {
    this.equippedPieces.forEach((piece) => {
      piece.sockets.forEach((socket) => socket.clear());
      piece.rampageSockets?.forEach((socket) => socket.clear());
    });
    this.notifyChanged();
  }

  reset() {
    this.weapon = null;
    ARMOR_TYPES.forEach((armorType) => (this.armorByType[armorType] = null));
    this.talisman = new Talisman();
    this.buffSettings = { ...DEFAULT_BUFF_SETTINGS };
    this.inactiveConditionalSkillIds.clear();
    this.notifyChanged();
  }

  toJSON() {
    const socketIds = (sockets) => sockets.map((socket) => socket.decorationId);
    return {
      weapon: this.weapon && {
        id: this.weapon.weaponData.id,
        decorations: socketIds(this.weapon.sockets),
        rampageDecorations: socketIds(this.weapon.rampageSockets),
        rampageSkillId: this.weapon.selectedRampageSkillId,
      },
      armor: Object.fromEntries(
        ARMOR_TYPES.map((armorType) => {
          const equippedArmor = this.armorByType[armorType];
          return [armorType, equippedArmor && {
            id: equippedArmor.armorData.id,
            upgradeLevel: equippedArmor.upgradeLevel,
            decorations: socketIds(equippedArmor.sockets),
          }];
        }),
      ),
      talisman: {
        skills: this.talisman.skillLevels,
        slots: this.talisman.slotLevels,
        decorations: socketIds(this.talisman.sockets),
      },
      buffs: this.buffSettings,
      inactiveConditions: [...this.inactiveConditionalSkillIds],
    };
  }

  /** Restores a saved build. Unknown ids are ignored so stale saves degrade gracefully. */
  loadJSON(savedBuild) {
    const repository = this.gameDataRepository;
    const lookupDecoration = (decorationId) => repository.getDecoration(decorationId);
    const lookupRampageDecoration = (decorationId) => repository.getRampageDecoration(decorationId);

    const weaponData = repository.getWeapon(savedBuild?.weapon?.id);
    this.weapon = weaponData ? new EquippedWeapon(weaponData) : null;
    if (this.weapon) {
      DecorationSocket.restoreDecorations(this.weapon.sockets, savedBuild.weapon.decorations, lookupDecoration);
      DecorationSocket.restoreDecorations(
        this.weapon.rampageSockets,
        savedBuild.weapon.rampageDecorations,
        (decorationId) => {
          const rampageDecoration = lookupRampageDecoration(decorationId);
          return rampageDecoration?.weaponTypes.includes(weaponData.type) ? rampageDecoration : null;
        },
      );
      this.weapon.selectRampageSkill(savedBuild.weapon.rampageSkillId);
    }

    // Saves made before per-piece upgrade levels only had a global "fully upgraded" switch.
    const legacyUpgradeLevel = savedBuild?.buffs?.useMaxArmorLevel === false ? 1 : null;
    ARMOR_TYPES.forEach((armorType) => {
      const savedArmor = savedBuild?.armor?.[armorType];
      const armorData = repository.getArmor(savedArmor?.id);
      this.armorByType[armorType] = armorData?.type === armorType
        ? new EquippedArmor(armorData, savedArmor.upgradeLevel ?? legacyUpgradeLevel)
        : null;
      if (this.armorByType[armorType]) {
        DecorationSocket.restoreDecorations(this.armorByType[armorType].sockets, savedArmor.decorations, lookupDecoration);
      }
    });

    this.talisman = new Talisman();
    const savedTalisman = savedBuild?.talisman;
    if (savedTalisman) {
      this.talisman.setSkillLevels((savedTalisman.skills ?? []).filter(({ skillId }) => repository.getSkill(skillId)));
      this.talisman.setSlotLevels(savedTalisman.slots ?? [], lookupDecoration);
      DecorationSocket.restoreDecorations(this.talisman.sockets, savedTalisman.decorations, lookupDecoration);
    }

    const { useMaxArmorLevel, ...savedBuffSettings } = savedBuild?.buffs ?? {};
    this.buffSettings = { ...DEFAULT_BUFF_SETTINGS, ...savedBuffSettings };
    this.inactiveConditionalSkillIds = new Set(savedBuild?.inactiveConditions ?? []);
    this.notifyChanged();
  }
}
