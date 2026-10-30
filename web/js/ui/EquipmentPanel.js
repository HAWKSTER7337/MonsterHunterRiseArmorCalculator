import { ARMOR_TYPES, ARMOR_TYPE_LABELS, ELEMENT_LABELS } from "../data/GameDataRepository.js";
import { Talisman } from "../models/Equipment.js";
import { createElement, createEquipmentIcon, createRarityBadge, createSelect, createSlotIcon, createWeaponRender } from "./dom.js";
import { weaponElementTypes } from "./EquipmentPickers.js";

const MAX_TALISMAN_SLOT_LEVEL = 4;

/** Left column: the weapon, five armor pieces and the talisman, each with clickable decoration sockets. */
export class EquipmentPanel {
  constructor(containerElement, gameDataRepository, build, equipmentPickers) {
    this.containerElement = containerElement;
    this.gameDataRepository = gameDataRepository;
    this.build = build;
    this.equipmentPickers = equipmentPickers;
  }

  render() {
    this.containerElement.replaceChildren(
      this.renderWeaponCard(),
      ...ARMOR_TYPES.map((armorType) => this.renderArmorCard(armorType)),
      this.renderTalismanCard(),
    );
  }

  /** `iconKey` is the weapon type or armor slot; with no item equipped the icon is shown greyed out. */
  renderCardHeader(label, itemData, onChoose, iconKey = null, elementTypes = []) {
    const icon = iconKey && createEquipmentIcon(iconKey, itemData ? itemData.rarity : "empty", elementTypes, "large");
    return createElement("button", { className: "equipment-header", onClick: onChoose, title: "Click to change" }, [
      icon,
      createElement("span", { className: "equipment-label", text: label }),
      itemData
        ? createElement("span", { className: "equipment-name" }, [createRarityBadge(itemData.rarity), itemData.name])
        : createElement("span", { className: "equipment-name empty", text: "None equipped - click to choose" }),
    ]);
  }

  renderSocketRow(sockets, lookupDecoration, openPicker, rowLabel = null) {
    if (sockets.length === 0) return null;
    return createElement("div", { className: "socket-row" }, [
      rowLabel && createElement("span", { className: "socket-row-label", text: rowLabel }),
      ...sockets.map((socket) => {
        const decoration = lookupDecoration(socket.decorationId);
        return createElement("div", { className: "socket" }, [
          createElement("button", {
            className: `socket-button${decoration ? " filled" : ""}`,
            title: decoration ? "Click to change decoration" : "Click to add a decoration",
            onClick: () => openPicker(socket),
          }, [
            createSlotIcon(socket.slotLevel, Boolean(decoration)),
            createElement("span", { className: "socket-name", text: decoration ? decoration.name : "Empty" }),
          ]),
          decoration && createElement("button", {
            className: "socket-clear",
            text: "×",
            title: "Remove decoration",
            onClick: () => this.build.setDecoration(socket, null),
          }),
        ]);
      }),
    ]);
  }

  renderMonsterLine(monsterNames) {
    if (monsterNames.length === 0) return null;
    return createElement("div", { className: "monster-line", text: `Made from: ${monsterNames.join(", ")}` });
  }

  renderSkillLine(skillLevels) {
    if (skillLevels.length === 0) return null;
    return createElement("div", { className: "skill-tags" }, skillLevels.map(({ skillId, level }) =>
      createElement("span", { className: "skill-tag", text: `${this.gameDataRepository.getSkill(skillId)?.name} ${level}` })));
  }

  renderWeaponCard() {
    const equippedWeapon = this.build.weapon;
    const weaponData = equippedWeapon?.weaponData ?? null;
    const label = weaponData ? this.gameDataRepository.getWeaponTypeName(weaponData.type) : "Weapon";
    const lookupDecoration = (decorationId) => this.gameDataRepository.getDecoration(decorationId);
    const lookupRampageDecoration = (decorationId) => this.gameDataRepository.getRampageDecoration(decorationId);

    return createElement("section", { className: "equipment-card weapon-card" }, [
      this.renderCardHeader(label, weaponData, () => this.equipmentPickers.openWeaponPicker(),
        weaponData?.type ?? this.equipmentPickers.lastWeaponType, weaponData ? weaponElementTypes(weaponData) : []),
      weaponData && createElement("div", { className: "equipment-stats" }, [
        createElement("span", { text: `Attack ${weaponData.attack}` }),
        createElement("span", { text: `Affinity ${weaponData.affinity}%` }),
        ...[weaponData.element, weaponData.subElement].filter(Boolean).map((element) =>
          createElement("span", { className: `element-text element-${element.type}`, text: `${ELEMENT_LABELS[element.type]} ${element.value}` })),
        weaponData.defenseBonus ? createElement("span", { text: `Defense +${weaponData.defenseBonus}` }) : null,
        ...weaponData.traits.map((trait) => createElement("span", { text: `${trait.label}: ${trait.value}` })),
      ]),
      weaponData && createWeaponRender(this.gameDataRepository.getWeaponRenderUrl(weaponData), weaponData.name, "weapon-render-equipped"),
      weaponData && this.renderMonsterLine(weaponData.monsters),
      weaponData && weaponData.rampageSkills.length > 0 && this.renderRampageSkillSelect(equippedWeapon),
      equippedWeapon && this.renderSocketRow(equippedWeapon.sockets, lookupDecoration,
        (socket) => this.equipmentPickers.openDecorationPicker(socket)),
      equippedWeapon && this.renderSocketRow(equippedWeapon.rampageSockets, lookupRampageDecoration,
        (socket) => this.equipmentPickers.openRampageDecorationPicker(socket), "Rampage"),
    ]);
  }

  renderRampageSkillSelect(equippedWeapon) {
    const options = [
      { value: "", label: "No rampage skill" },
      ...equippedWeapon.weaponData.rampageSkills.map((rampageSkillId) => {
        const rampageSkill = this.gameDataRepository.getRampageSkill(rampageSkillId);
        return { value: rampageSkillId, label: `${rampageSkill.name} - ${rampageSkill.description}` };
      }),
    ];
    return createElement("label", { className: "inline-field" }, [
      createElement("span", { text: "Rampage skill" }),
      createSelect(options, equippedWeapon.selectedRampageSkillId ?? "", (value) =>
        this.build.selectRampageSkill(value === "" ? null : Number(value))),
    ]);
  }

  renderArmorCard(armorType) {
    const equippedArmor = this.build.armorByType[armorType];
    const armorData = equippedArmor?.armorData ?? null;
    return createElement("section", { className: "equipment-card" }, [
      this.renderCardHeader(ARMOR_TYPE_LABELS[armorType], armorData, () => this.equipmentPickers.openArmorPicker(armorType), armorType),
      equippedArmor && this.renderDefenseSlider(armorType, equippedArmor),
      armorData && createElement("div", { className: "equipment-stats" }, [
        ...Object.entries(armorData.resistances).filter(([, value]) => value !== 0).map(([elementType, value]) =>
          createElement("span", { className: `element-text element-${elementType}`, text: `${ELEMENT_LABELS[elementType]} ${value > 0 ? "+" : ""}${value}` })),
      ]),
      armorData && this.renderSkillLine(armorData.skills),
      armorData && this.renderMonsterLine(armorData.monsters),
      equippedArmor && this.renderSocketRow(equippedArmor.sockets,
        (decorationId) => this.gameDataRepository.getDecoration(decorationId),
        (socket) => this.equipmentPickers.openDecorationPicker(socket)),
    ]);
  }

  /** Slider over upgrade levels, from the piece's base defense up to its fully upgraded defense. */
  renderDefenseSlider(armorType, equippedArmor) {
    const armorData = equippedArmor.armorData;
    const valueLabel = createElement("span", { className: "defense-slider-value" });
    const updateValueLabel = () => {
      valueLabel.textContent = `Defense ${equippedArmor.currentDefense} · Lv ${equippedArmor.upgradeLevel}/${equippedArmor.maxUpgradeLevel}`;
    };
    const slider = createElement("input", {
      className: "defense-slider",
      attributes: {
        type: "range",
        min: 1,
        max: equippedArmor.maxUpgradeLevel,
        step: 1,
        disabled: equippedArmor.maxUpgradeLevel <= 1,
        "aria-label": `${ARMOR_TYPE_LABELS[armorType]} upgrade level`,
      },
      onInput: (event) => {
        this.build.setArmorUpgradeLevel(armorType, event.target.value);
        updateValueLabel();
      },
    });
    slider.value = equippedArmor.upgradeLevel;
    updateValueLabel();
    return createElement("div", { className: "defense-slider-row" }, [
      createElement("span", { className: "defense-slider-bound", text: armorData.defense }),
      slider,
      createElement("span", { className: "defense-slider-bound", text: armorData.maxDefense }),
      valueLabel,
    ]);
  }

  renderTalismanCard() {
    const talisman = this.build.talisman;
    const skillOptions = [
      { value: "", label: "No skill" },
      ...this.gameDataRepository.skillsSortedByName.map((skill) => ({ value: skill.id, label: skill.name })),
    ];
    const slotOptions = [{ value: 0, label: "No slot" },
      ...Array.from({ length: MAX_TALISMAN_SLOT_LEVEL }, (_, index) => ({ value: index + 1, label: `Level ${index + 1}` }))];

    const skillRows = Array.from({ length: Talisman.MAX_SKILLS }, (_, skillIndex) => {
      const skillLevel = talisman.skillLevels[skillIndex] ?? { skillId: null, level: 1 };
      const skillData = this.gameDataRepository.getSkill(skillLevel.skillId);
      const levelOptions = Array.from({ length: skillData?.maxLevel ?? 1 }, (_, levelIndex) => ({ value: levelIndex + 1, label: `Lv ${levelIndex + 1}` }));
      return createElement("div", { className: "talisman-skill-row" }, [
        createSelect(skillOptions, skillLevel.skillId ?? "", (value) =>
          this.updateTalismanSkill(skillIndex, { skillId: value === "" ? null : Number(value), level: 1 }), "talisman-skill-select"),
        createSelect(levelOptions, skillLevel.level, (value) =>
          this.updateTalismanSkill(skillIndex, { skillId: skillLevel.skillId, level: Number(value) }), "talisman-level-select"),
      ]);
    });

    const slotLevels = talisman.slotLevels;
    const slotSelects = Array.from({ length: Talisman.MAX_SLOTS }, (_, slotIndex) =>
      createSelect(slotOptions, slotLevels[slotIndex] ?? 0, (value) => {
        const updatedSlotLevels = Array.from({ length: Talisman.MAX_SLOTS }, (_, index) => slotLevels[index] ?? 0);
        updatedSlotLevels[slotIndex] = Number(value);
        this.build.updateTalisman(talisman.skillLevels, updatedSlotLevels);
      }));

    return createElement("section", { className: "equipment-card" }, [
      createElement("div", { className: "equipment-header static" }, [
        createElement("span", { className: "equipment-label", text: "Talisman" }),
        createElement("span", { className: "equipment-name muted", text: "Enter your talisman's skills and slots" }),
      ]),
      ...skillRows,
      createElement("div", { className: "talisman-slot-row" }, [createElement("span", { text: "Slots" }), ...slotSelects]),
      this.renderSocketRow(talisman.sockets,
        (decorationId) => this.gameDataRepository.getDecoration(decorationId),
        (socket) => this.equipmentPickers.openDecorationPicker(socket)),
    ]);
  }

  updateTalismanSkill(skillIndex, newSkillLevel) {
    const talisman = this.build.talisman;
    const skillLevels = Array.from({ length: Talisman.MAX_SKILLS }, (_, index) =>
      talisman.skillLevels[index] ?? { skillId: null, level: 0 });
    skillLevels[skillIndex] = newSkillLevel;
    this.build.updateTalisman(skillLevels, talisman.slotLevels);
  }
}
