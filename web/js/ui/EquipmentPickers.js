import { ARMOR_TYPE_LABELS, ELEMENT_LABELS } from "../data/GameDataRepository.js";
import { createElement, createRarityBadge, createSlotIcon } from "./dom.js";
import { PickerDialog } from "./PickerDialog.js";
import { SharpnessBarView } from "./SharpnessBarView.js";

const RANK_FILTER_OPTIONS = [
  { value: "all", label: "All ranks" },
  { value: "MR", label: "Master Rank" },
  { value: "HR", label: "High Rank" },
  { value: "LR", label: "Low Rank" },
];

const rankForRarity = (rarity) => (rarity <= 3 ? "LR" : rarity <= 7 ? "HR" : "MR");

/** Opens the picker dialog configured for each kind of equipment. */
export class EquipmentPickers {
  constructor(gameDataRepository, build) {
    this.gameDataRepository = gameDataRepository;
    this.build = build;
    this.pickerDialog = new PickerDialog();
    this.lastWeaponType = gameDataRepository.weaponTypes[0].key;
  }

  createSlotIcons(slotLevels) {
    return createElement("span", { className: "slot-icons" },
      slotLevels.length ? slotLevels.map((slotLevel) => createSlotIcon(slotLevel)) : [createElement("span", { className: "muted", text: "No slots" })]);
  }

  createSkillTags(skillLevels) {
    return createElement("span", { className: "skill-tags" },
      skillLevels.map(({ skillId, level }) =>
        createElement("span", { className: "skill-tag", text: `${this.gameDataRepository.getSkill(skillId)?.name} ${level}` })));
  }

  openWeaponPicker() {
    const repository = this.gameDataRepository;
    const currentWeaponData = this.build.weapon?.weaponData ?? null;
    const initialWeaponType = currentWeaponData?.type ?? this.lastWeaponType;
    this.pickerDialog.open({
      title: "Choose a weapon",
      items: [...repository.weapons].sort((first, second) => second.rarity - first.rarity || first.sortId - second.sortId),
      selectedItem: currentWeaponData,
      allowRemove: Boolean(currentWeaponData),
      filters: [
        {
          label: "Type",
          options: repository.weaponTypes.map((weaponType) => ({ value: weaponType.key, label: weaponType.name })),
          initialValue: initialWeaponType,
          matches: (weapon, weaponTypeKey) => weapon.type === weaponTypeKey,
        },
        {
          label: "Rank",
          options: RANK_FILTER_OPTIONS,
          matches: (weapon, rank) => rank === "all" || rankForRarity(weapon.rarity) === rank,
        },
      ],
      searchText: (weapon) => [
        weapon.name,
        weapon.element ? ELEMENT_LABELS[weapon.element.type] : "",
        ...weapon.rampageSkills.map((rampageSkillId) => repository.getRampageSkill(rampageSkillId)?.name ?? ""),
      ].join(" "),
      renderRow: (weapon) => this.renderWeaponRow(weapon),
      onSelect: (weapon) => {
        if (weapon) this.lastWeaponType = weapon.type;
        this.build.equipWeapon(weapon);
      },
    });
  }

  renderWeaponRow(weapon) {
    const elementText = [weapon.element, weapon.subElement]
      .filter(Boolean)
      .map((element) => `${ELEMENT_LABELS[element.type]} ${element.value}`)
      .join(" / ");
    return createElement("div", { className: "picker-row-content" }, [
      createElement("div", { className: "picker-row-main" }, [
        createRarityBadge(weapon.rarity),
        createElement("span", { className: "picker-row-name", text: weapon.name }),
      ]),
      createElement("div", { className: "picker-row-stats" }, [
        createElement("span", { text: `Atk ${weapon.attack}` }),
        createElement("span", { className: weapon.affinity < 0 ? "negative" : "", text: `Aff ${weapon.affinity}%` }),
        elementText && createElement("span", { className: `element-text element-${weapon.element?.type}`, text: elementText }),
        weapon.defenseBonus ? createElement("span", { text: `Def +${weapon.defenseBonus}` }) : null,
        this.createSlotIcons(weapon.slots),
        weapon.rampageSlots.length
          ? createElement("span", { className: "rampage-slots" }, ["Rampage ", ...weapon.rampageSlots.map((slotLevel) => createSlotIcon(slotLevel))])
          : null,
      ]),
      weapon.sharpness ? SharpnessBarView.render(weapon.sharpness, true) : null,
    ]);
  }

  openArmorPicker(armorType) {
    const repository = this.gameDataRepository;
    const currentArmorData = this.build.armorByType[armorType]?.armorData ?? null;
    this.pickerDialog.open({
      title: `Choose ${ARMOR_TYPE_LABELS[armorType].toLowerCase()} armor`,
      items: repository.getArmorOfType(armorType).sort((first, second) => second.rarity - first.rarity || first.sortId - second.sortId),
      selectedItem: currentArmorData,
      allowRemove: Boolean(currentArmorData),
      filters: [{
        label: "Rank",
        options: RANK_FILTER_OPTIONS,
        matches: (armorPiece, rank) => rank === "all" || armorPiece.rank === rank,
      }],
      searchText: (armorPiece) => `${armorPiece.name} ${armorPiece.seriesName} ${repository.describeSkillList(armorPiece.skills)}`,
      renderRow: (armorPiece) => createElement("div", { className: "picker-row-content" }, [
        createElement("div", { className: "picker-row-main" }, [
          createRarityBadge(armorPiece.rarity),
          createElement("span", { className: "picker-row-name", text: armorPiece.name }),
        ]),
        createElement("div", { className: "picker-row-stats" }, [
          createElement("span", { text: `Def ${armorPiece.defense}→${armorPiece.maxDefense}` }),
          this.createSlotIcons(armorPiece.slots),
          createElement("span", { className: "resistance-summary" },
            Object.entries(armorPiece.resistances).map(([elementType, value]) =>
              createElement("span", { className: `element-text element-${elementType}${value < 0 ? " negative" : ""}`, title: `${ELEMENT_LABELS[elementType]} resistance`, text: `${ELEMENT_LABELS[elementType][0]}${value}` }))),
        ]),
        this.createSkillTags(armorPiece.skills),
      ]),
      onSelect: (armorPiece) => this.build.equipArmor(armorType, armorPiece),
    });
  }

  openDecorationPicker(socket) {
    const repository = this.gameDataRepository;
    const currentDecoration = repository.getDecoration(socket.decorationId);
    this.pickerDialog.open({
      title: `Choose a decoration for a level ${socket.slotLevel} slot`,
      items: repository.getDecorationsFittingSlot(socket.slotLevel),
      selectedItem: currentDecoration,
      allowRemove: Boolean(currentDecoration),
      filters: [{
        label: "Jewel size",
        options: [{ value: "all", label: "Any size that fits" },
          ...[4, 3, 2, 1].filter((slotLevel) => slotLevel <= socket.slotLevel).map((slotLevel) => ({ value: slotLevel, label: `Level ${slotLevel}` }))],
        matches: (decoration, slotLevel) => slotLevel === "all" || decoration.slotLevel === Number(slotLevel),
      }],
      searchText: (decoration) => `${decoration.name} ${repository.describeSkillList(decoration.skills)}`,
      renderRow: (decoration) => this.renderDecorationRow(decoration, repository.describeSkillList(decoration.skills)),
      onSelect: (decoration) => this.build.setDecoration(socket, decoration),
    });
  }

  openRampageDecorationPicker(socket) {
    const repository = this.gameDataRepository;
    const weaponType = this.build.weapon.weaponData.type;
    const currentDecoration = repository.getRampageDecoration(socket.decorationId);
    this.pickerDialog.open({
      title: `Choose a rampage decoration for a level ${socket.slotLevel} slot`,
      items: repository.getRampageDecorationsFittingSlot(socket.slotLevel, weaponType),
      selectedItem: currentDecoration,
      allowRemove: Boolean(currentDecoration),
      filters: [],
      searchText: (rampageDecoration) => {
        const rampageSkill = repository.getRampageSkill(rampageDecoration.rampageSkillId);
        return `${rampageDecoration.name} ${rampageSkill?.name ?? ""} ${rampageSkill?.description ?? ""}`;
      },
      renderRow: (rampageDecoration) => {
        const rampageSkill = repository.getRampageSkill(rampageDecoration.rampageSkillId);
        return this.renderDecorationRow(rampageDecoration, `${rampageSkill?.name ?? "?"}: ${rampageSkill?.description ?? ""}`);
      },
      onSelect: (rampageDecoration) => this.build.setDecoration(socket, rampageDecoration),
    });
  }

  renderDecorationRow(decoration, skillDescription) {
    return createElement("div", { className: "picker-row-content" }, [
      createElement("div", { className: "picker-row-main" }, [
        createSlotIcon(decoration.slotLevel, true),
        createElement("span", { className: "picker-row-name", text: decoration.name }),
        createRarityBadge(decoration.rarity),
      ]),
      createElement("div", { className: "picker-row-detail", text: skillDescription }),
    ]);
  }
}
