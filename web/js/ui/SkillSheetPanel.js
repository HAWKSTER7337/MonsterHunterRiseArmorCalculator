import { createElement } from "./dom.js";

/** Right column: every skill the build has, its level, its effect and which pieces grant it. */
export class SkillSheetPanel {
  constructor(containerElement, build) {
    this.containerElement = containerElement;
    this.build = build;
  }

  render(activeSkills) {
    const header = createElement("h2", { text: `Skills (${activeSkills.length})` });
    if (activeSkills.length === 0) {
      this.containerElement.replaceChildren(header,
        createElement("p", { className: "muted", text: "Equip armor or socket decorations to gain skills." }));
      return;
    }
    this.containerElement.replaceChildren(header, ...activeSkills.map((activeSkill) => this.renderSkill(activeSkill)));
  }

  renderLevelPips(activeSkill) {
    const maxLevel = activeSkill.skillData.maxLevel;
    return createElement("div", { className: "level-pips" }, [
      ...Array.from({ length: maxLevel }, (_, levelIndex) =>
        createElement("span", { className: `level-pip${levelIndex < activeSkill.effectiveLevel ? " filled" : ""}` })),
      activeSkill.overflowPoints > 0
        ? createElement("span", { className: "overflow", text: `+${activeSkill.overflowPoints} wasted`, title: "Points beyond the max level have no effect" })
        : null,
    ]);
  }

  renderConditionToggle(activeSkill) {
    const effect = activeSkill.effect;
    if (!effect?.isConditional) return null;
    const skillId = activeSkill.skillData.id;
    const checkbox = createElement("input", {
      attributes: { type: "checkbox" },
      onChange: (event) => this.build.setConditionActive(skillId, event.target.checked),
    });
    checkbox.checked = this.build.isConditionActive(skillId);
    return createElement("label", { className: "condition-toggle", title: "Include this conditional skill in the stat calculation" }, [
      checkbox,
      createElement("span", { text: `Active: ${effect.conditionLabel}` }),
    ]);
  }

  renderSkill(activeSkill) {
    const skillData = activeSkill.skillData;
    const sourceText = activeSkill.sources.map(({ sourceName, points }) => `${sourceName} +${points}`).join(", ");
    return createElement("article", { className: "skill-entry" }, [
      createElement("div", { className: "skill-entry-header" }, [
        createElement("span", { className: "skill-name", text: skillData.name }),
        activeSkill.effect && createElement("span", { className: "calc-tag", text: "in stats", title: "This skill's effect is included in the stat calculation" }),
        createElement("span", { className: "skill-level", text: `Lv ${activeSkill.effectiveLevel}/${skillData.maxLevel}` }),
      ]),
      this.renderLevelPips(activeSkill),
      createElement("div", { className: "skill-detail", text: activeSkill.currentLevelDetail || skillData.description }),
      this.renderConditionToggle(activeSkill),
      createElement("div", { className: "skill-sources", text: sourceText }),
    ]);
  }
}
