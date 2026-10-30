import { ELEMENT_LABELS, ELEMENTAL_TYPES } from "../data/GameDataRepository.js";
import { createElement, formatNumber } from "./dom.js";
import { SharpnessBarView } from "./SharpnessBarView.js";

/** Middle column: computed weapon and defensive stats. */
export class StatsPanel {
  constructor(containerElement) {
    this.containerElement = containerElement;
  }

  render(statSheet) {
    this.containerElement.replaceChildren(
      this.renderWeaponSection(statSheet.weapon),
      this.renderDefenseSection(statSheet.defense, statSheet.resistances),
    );
  }

  renderStat(label, value, detail = null, valueClassName = "") {
    return createElement("div", { className: "stat" }, [
      createElement("div", { className: "stat-label", text: label }),
      createElement("div", { className: `stat-value ${valueClassName}`, text: value }),
      detail && createElement("div", { className: "stat-detail", text: detail }),
    ]);
  }

  renderWeaponSection(weaponStats) {
    const section = createElement("section", { className: "panel-section" }, [
      createElement("h2", { text: "Offense" }),
    ]);
    if (!weaponStats) {
      section.append(createElement("p", { className: "muted", text: "Equip a weapon to see attack, affinity, element and sharpness." }));
      return section;
    }

    const criticalPercent = Math.round((weaponStats.criticalDamageMultiplier - 1) * 100);
    const statGrid = createElement("div", { className: "stat-grid" }, [
      this.renderStat("Attack", weaponStats.attack, `Weapon base ${weaponStats.baseAttack}`),
      this.renderStat("Affinity", `${weaponStats.affinity}%`, `Crit damage +${criticalPercent}%`,
        weaponStats.affinity < 0 ? "negative" : ""),
      ...[weaponStats.element, weaponStats.subElement].filter(Boolean).map((element) =>
        this.renderStat(ELEMENT_LABELS[element.type], element.value, `Weapon base ${element.baseValue}`, `element-text element-${element.type}`)),
      this.renderStat("Effective Raw", formatNumber(weaponStats.effectiveRaw, 1),
        "Attack × sharpness × average crit"),
      weaponStats.effectiveElement !== null && this.renderStat("Effective Element", formatNumber(weaponStats.effectiveElement, 1),
        "Element × sharpness × crit element"),
      weaponStats.effectiveSubElement !== null && this.renderStat("Effective Sub Element", formatNumber(weaponStats.effectiveSubElement, 1)),
    ]);
    section.append(statGrid);

    if (weaponStats.sharpnessBar) {
      const sharpnessBar = weaponStats.sharpnessBar;
      section.append(createElement("div", { className: "sharpness-block" }, [
        createElement("div", { className: "stat-label", text: "Sharpness (with Handicraft)" }),
        SharpnessBarView.render(sharpnessBar.segmentLengths),
        createElement("div", { className: "stat-detail" }, [
          `Top color: ${sharpnessBar.topColorName} · raw ×${sharpnessBar.rawMultiplier} · element ×${sharpnessBar.elementMultiplier}`,
          weaponStats.isBludgeonerActive ? " · Bludgeoner active" : "",
        ]),
      ]));
    }

    if (weaponStats.appliedRampageSkills.length > 0) {
      section.append(createElement("div", { className: "rampage-list" }, [
        createElement("div", { className: "stat-label", text: "Rampage effects" }),
        ...weaponStats.appliedRampageSkills.map(({ rampageSkill, sourceName, isActive }) =>
          createElement("div", { className: `rampage-entry${isActive ? "" : " inactive"}` }, [
            createElement("strong", { text: rampageSkill.name }),
            ` (${sourceName}) - ${rampageSkill.description}`,
            isActive ? "" : " [requirement not met for this weapon]",
          ])),
      ]));
    }
    return section;
  }

  renderDefenseSection(defense, resistances) {
    return createElement("section", { className: "panel-section" }, [
      createElement("h2", { text: "Defense" }),
      createElement("div", { className: "stat-grid" }, [
        this.renderStat("Defense", defense.total,
          `Armor ${defense.armorDefense} + weapon ${defense.weaponDefenseBonus} + items ${defense.itemDefenseBonus}, then skills`),
      ]),
      createElement("div", { className: "resistance-grid" }, ELEMENTAL_TYPES.map((elementType) =>
        createElement("div", { className: "resistance" }, [
          createElement("span", { className: `element-text element-${elementType}`, text: ELEMENT_LABELS[elementType] }),
          createElement("span", { className: `resistance-value${resistances[elementType] < 0 ? " negative" : ""}`, text: resistances[elementType] }),
        ]))),
    ]);
  }
}
