import { SharpnessCalculator } from "../calc/SharpnessCalculator.js";
import { ARMOR_TYPE_LABELS, ELEMENT_LABELS, ELEMENTAL_TYPES } from "../data/GameDataRepository.js";
import { createElement, createRarityBadge, createSlotIcon } from "./dom.js";
import { PickerDialog } from "./PickerDialog.js";
import { SharpnessBarView } from "./SharpnessBarView.js";

const MAX_HANDICRAFT_POINTS = 50;
const WHITE_SHARPNESS_INDEX = 5;
const PURPLE_SHARPNESS_INDEX = 6;

const rankForRarity = (rarity) => (rarity <= 3 ? "LR" : rarity <= 7 ? "HR" : "MR");
const totalSlotLevels = (slotLevels) => slotLevels.reduce((total, slotLevel) => total + slotLevel, 0);
const totalSkillPoints = (skillLevels) => skillLevels.reduce((total, skillLevel) => total + skillLevel.level, 0);
const byName = (first, second) => first.name.localeCompare(second.name);
const byRarityDescending = (first, second) => second.rarity - first.rarity || first.sortId - second.sortId;

/** Filter and sort definitions shared by the weapon and armor pickers. */
class EquipmentFilters {
  static rankFilter() {
    return {
      label: "Rank",
      defaultValue: "all",
      options: [
        { value: "all", label: "All" },
        { value: "MR", label: "Master Rank" },
        { value: "HR", label: "High Rank" },
        { value: "LR", label: "Low Rank" },
      ],
      matches: (item, rank) => rankForRarity(item.rarity) === rank,
    };
  }

  static rarityFilter(items) {
    const rarities = [...new Set(items.map((item) => item.rarity))].sort((first, second) => second - first);
    return {
      label: "Rarity",
      defaultValue: "all",
      options: [{ value: "all", label: "All" }, ...rarities.map((rarity) => ({ value: rarity, label: `Rarity ${rarity}` }))],
      matches: (item, rarity) => item.rarity === Number(rarity),
    };
  }

  static slotFilter(label, getSlotLevels) {
    return {
      label,
      defaultValue: "all",
      options: [
        { value: "all", label: "Any" },
        { value: "hasAny", label: "At least 1 slot" },
        { value: "twoOrMore", label: "2+ slots" },
        { value: "three", label: "3 slots" },
        { value: "level3", label: "Has a level 3+ slot" },
        { value: "level4", label: "Has a level 4 slot" },
        { value: "none", label: "No slots" },
      ],
      matches: (item, slotRequirement) => {
        const slotLevels = getSlotLevels(item);
        switch (slotRequirement) {
          case "hasAny": return slotLevels.length >= 1;
          case "twoOrMore": return slotLevels.length >= 2;
          case "three": return slotLevels.length >= 3;
          case "level3": return slotLevels.some((slotLevel) => slotLevel >= 3);
          case "level4": return slotLevels.some((slotLevel) => slotLevel >= 4);
          case "none": return slotLevels.length === 0;
          default: return true;
        }
      },
    };
  }

  static minimumFilter(label, getValue) {
    return { label, type: "number", defaultValue: "", matches: (item, minimum) => getValue(item) >= minimum };
  }
}

/** Opens the picker dialog configured for each kind of equipment. */
export class EquipmentPickers {
  constructor(gameDataRepository, build) {
    this.gameDataRepository = gameDataRepository;
    this.build = build;
    this.pickerDialog = new PickerDialog();
    this.lastWeaponType = gameDataRepository.weaponTypes[0].key;
    this.maxHandicraftBarByWeaponId = new Map(gameDataRepository.weapons.map((weapon) => [
      weapon.id,
      SharpnessCalculator.calculate(weapon.sharpness, weapon.handicraft, MAX_HANDICRAFT_POINTS),
    ]));
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
    const weapons = repository.weapons;
    const elementValue = (weapon) => weapon.element?.value ?? 0;

    this.pickerDialog.open({
      key: "weapon",
      title: "Choose a weapon",
      items: weapons,
      selectedItem: currentWeaponData,
      allowRemove: Boolean(currentWeaponData),
      initialFilterValues: { Type: initialWeaponType },
      filters: [
        {
          label: "Type",
          defaultValue: initialWeaponType,
          options: repository.weaponTypes.map((weaponType) => ({ value: weaponType.key, label: weaponType.name })),
          matches: (weapon, weaponTypeKey) => weapon.type === weaponTypeKey,
        },
        EquipmentFilters.rankFilter(),
        EquipmentFilters.rarityFilter(weapons),
        {
          label: "Element",
          defaultValue: "all",
          options: [
            { value: "all", label: "Any" },
            { value: "none", label: "Raw (no element)" },
            { value: "elemental", label: "Any elemental" },
            { value: "status", label: "Any status" },
            ...Object.entries(ELEMENT_LABELS).map(([elementType, elementLabel]) => ({ value: elementType, label: elementLabel })),
          ],
          matches: (weapon, elementRequirement) => {
            const elementTypes = [weapon.element?.type, weapon.subElement?.type].filter(Boolean);
            if (elementRequirement === "none") return elementTypes.length === 0;
            if (elementRequirement === "elemental") return elementTypes.some((elementType) => ELEMENTAL_TYPES.includes(elementType));
            if (elementRequirement === "status") return elementTypes.some((elementType) => !ELEMENTAL_TYPES.includes(elementType));
            return elementTypes.includes(elementRequirement);
          },
        },
        EquipmentFilters.slotFilter("Deco slots", (weapon) => weapon.slots),
        {
          label: "Rampage",
          defaultValue: "all",
          options: [
            { value: "all", label: "Any" },
            { value: "slot", label: "Has a rampage slot" },
            { value: "slot3", label: "Has a level 3 rampage slot" },
            { value: "skills", label: "Has rampage skill choices" },
          ],
          matches: (weapon, rampageRequirement) => {
            if (rampageRequirement === "slot") return weapon.rampageSlots.length > 0;
            if (rampageRequirement === "slot3") return weapon.rampageSlots.some((slotLevel) => slotLevel >= 3);
            return weapon.rampageSkills.length > 0;
          },
        },
        {
          label: "Sharpness (Handicraft 5)",
          defaultValue: "all",
          options: [
            { value: "all", label: "Any" },
            { value: "white", label: "Reaches white or better" },
            { value: "purple", label: "Reaches purple" },
          ],
          matches: (weapon, sharpnessRequirement) => {
            const maxHandicraftBar = this.maxHandicraftBarByWeaponId.get(weapon.id);
            if (!maxHandicraftBar) return false;
            return maxHandicraftBar.topColorIndex >= (sharpnessRequirement === "purple" ? PURPLE_SHARPNESS_INDEX : WHITE_SHARPNESS_INDEX);
          },
        },
        EquipmentFilters.minimumFilter("Min attack", (weapon) => weapon.attack),
        EquipmentFilters.minimumFilter("Min affinity %", (weapon) => weapon.affinity),
      ],
      sortOptions: [
        { value: "rarity", label: "Rarity (high to low)", compare: byRarityDescending },
        { value: "attack", label: "Attack (high to low)", compare: (first, second) => second.attack - first.attack || byRarityDescending(first, second) },
        { value: "affinity", label: "Affinity (high to low)", compare: (first, second) => second.affinity - first.affinity || second.attack - first.attack },
        { value: "element", label: "Element (high to low)", compare: (first, second) => elementValue(second) - elementValue(first) || second.attack - first.attack },
        { value: "slots", label: "Deco slots (most first)", compare: (first, second) => totalSlotLevels(second.slots) - totalSlotLevels(first.slots) || byRarityDescending(first, second) },
        { value: "name", label: "Name (A to Z)", compare: byName },
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
      weapon.sharpness
        ? SharpnessBarView.render(weapon.sharpness, true, this.maxHandicraftBarByWeaponId.get(weapon.id).segmentLengths)
        : null,
    ]);
  }

  openArmorPicker(armorType) {
    const repository = this.gameDataRepository;
    const currentArmorData = this.build.armorByType[armorType]?.armorData ?? null;
    const armorPieces = repository.getArmorOfType(armorType);
    const skillIdsOnArmor = new Set(armorPieces.flatMap((armorPiece) => armorPiece.skills.map((skillLevel) => skillLevel.skillId)));
    const skillOptions = [
      { value: "all", label: "Any" },
      ...repository.skillsSortedByName
        .filter((skill) => skillIdsOnArmor.has(skill.id))
        .map((skill) => ({ value: skill.id, label: skill.name })),
    ];
    const hasSkill = (armorPiece, skillId) => armorPiece.skills.some((skillLevel) => skillLevel.skillId === Number(skillId));
    const skillLevelOf = (armorPiece, skillId) =>
      armorPiece.skills.find((skillLevel) => skillLevel.skillId === Number(skillId))?.level ?? 0;
    const resistanceTotal = (armorPiece) => Object.values(armorPiece.resistances).reduce((total, value) => total + value, 0);

    this.pickerDialog.open({
      key: `armor-${armorType}`,
      title: `Choose ${ARMOR_TYPE_LABELS[armorType].toLowerCase()} armor`,
      items: armorPieces,
      selectedItem: currentArmorData,
      allowRemove: Boolean(currentArmorData),
      filters: [
        EquipmentFilters.rankFilter(),
        EquipmentFilters.rarityFilter(armorPieces),
        { label: "Has skill", defaultValue: "all", options: skillOptions, matches: hasSkill },
        { label: "And skill", defaultValue: "all", options: skillOptions, matches: hasSkill },
        EquipmentFilters.slotFilter("Deco slots", (armorPiece) => armorPiece.slots),
        {
          label: "Resistances",
          defaultValue: "all",
          options: [
            { value: "all", label: "Any" },
            { value: "noNegative", label: "No negative resistances" },
            ...ELEMENTAL_TYPES.map((elementType) => ({ value: elementType, label: `Positive ${ELEMENT_LABELS[elementType]}` })),
          ],
          matches: (armorPiece, resistanceRequirement) => resistanceRequirement === "noNegative"
            ? Object.values(armorPiece.resistances).every((value) => value >= 0)
            : armorPiece.resistances[resistanceRequirement] > 0,
        },
        EquipmentFilters.minimumFilter("Min max defense", (armorPiece) => armorPiece.maxDefense),
      ],
      sortOptions: [
        { value: "rarity", label: "Rarity (high to low)", compare: byRarityDescending },
        { value: "defense", label: "Max defense (high to low)", compare: (first, second) => second.maxDefense - first.maxDefense || byRarityDescending(first, second) },
        { value: "slots", label: "Deco slots (most first)", compare: (first, second) => totalSlotLevels(second.slots) - totalSlotLevels(first.slots) || byRarityDescending(first, second) },
        { value: "skills", label: "Skill points (most first)", compare: (first, second) => totalSkillPoints(second.skills) - totalSkillPoints(first.skills) || byRarityDescending(first, second) },
        { value: "resistance", label: "Total resistance (high to low)", compare: (first, second) => resistanceTotal(second) - resistanceTotal(first) || byRarityDescending(first, second) },
        { value: "filteredSkill", label: "Level of \"Has skill\" (high to low)", compare: (first, second, filterValuesByLabel) => {
          const filteredSkillId = filterValuesByLabel["Has skill"];
          return skillLevelOf(second, filteredSkillId) - skillLevelOf(first, filteredSkillId) || byRarityDescending(first, second);
        } },
        { value: "name", label: "Name (A to Z)", compare: byName },
      ],
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
              createElement("span", { className: `element-text element-${elementType}${value < 0 ? " negative" : ""}`, title: `${ELEMENT_LABELS[elementType]} resistance`, text: `${ELEMENT_LABELS[elementType]} ${value}` }))),
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
      key: "decoration",
      title: `Choose a decoration for a level ${socket.slotLevel} slot`,
      items: repository.getDecorationsFittingSlot(socket.slotLevel),
      selectedItem: currentDecoration,
      allowRemove: Boolean(currentDecoration),
      filters: [{
        label: "Jewel size",
        defaultValue: "all",
        options: [{ value: "all", label: "Any size that fits" },
          ...[4, 3, 2, 1].filter((slotLevel) => slotLevel <= socket.slotLevel).map((slotLevel) => ({ value: slotLevel, label: `Level ${slotLevel}` }))],
        matches: (decoration, slotLevel) => decoration.slotLevel === Number(slotLevel),
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
      key: "rampage-decoration",
      title: `Choose a rampage decoration for a level ${socket.slotLevel} slot`,
      items: repository.getRampageDecorationsFittingSlot(socket.slotLevel, weaponType),
      selectedItem: currentDecoration,
      allowRemove: Boolean(currentDecoration),
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
