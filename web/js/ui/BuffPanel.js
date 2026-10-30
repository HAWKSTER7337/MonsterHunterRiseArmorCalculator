import { createElement } from "./dom.js";

const TOGGLE_SETTINGS = [
  { settingName: "powercharm", label: "Powercharm (+6 attack)" },
  { settingName: "powertalon", label: "Powertalon (+9 attack)" },
  { settingName: "armorcharm", label: "Armorcharm (+12 defense)" },
  { settingName: "armortalon", label: "Armortalon (+18 defense)" },
];

const NUMBER_SETTINGS = [
  { settingName: "petalaceAttack", label: "Petalace attack" },
  { settingName: "petalaceDefense", label: "Petalace defense" },
];

/** Build-wide settings: bulk armor upgrade level and always-on item buffs. */
export class BuffPanel {
  constructor(containerElement, build) {
    this.containerElement = containerElement;
    this.build = build;
  }

  render() {
    const buffSettings = this.build.buffSettings;
    const toggles = TOGGLE_SETTINGS.map(({ settingName, label }) => {
      const checkbox = createElement("input", {
        attributes: { type: "checkbox" },
        onChange: (event) => this.build.updateBuffSetting(settingName, event.target.checked),
      });
      checkbox.checked = Boolean(buffSettings[settingName]);
      return createElement("label", { className: "buff-toggle" }, [checkbox, createElement("span", { text: label })]);
    });
    const numberInputs = NUMBER_SETTINGS.map(({ settingName, label }) => {
      const input = createElement("input", {
        attributes: { type: "number", min: 0, max: 200, step: 1 },
        onChange: (event) => this.build.updateBuffSetting(settingName, Math.max(0, Number(event.target.value) || 0)),
      });
      input.value = buffSettings[settingName];
      return createElement("label", { className: "buff-number" }, [createElement("span", { text: label }), input]);
    });
    const armorUpgradeRow = createElement("div", { className: "armor-upgrade-row" }, [
      createElement("span", { text: "Set all armor defense to" }),
      createElement("button", { className: "button", text: "Base", onClick: () => this.build.setAllArmorUpgraded(false) }),
      createElement("button", { className: "button", text: "Max", onClick: () => this.build.setAllArmorUpgraded(true) }),
    ]);
    this.containerElement.replaceChildren(
      createElement("h2", { text: "Buffs & Settings" }),
      armorUpgradeRow,
      createElement("div", { className: "buff-grid" }, [...toggles, ...numberInputs]),
    );
  }
}
