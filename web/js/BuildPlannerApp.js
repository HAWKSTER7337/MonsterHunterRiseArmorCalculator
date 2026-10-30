import { BuildStorage } from "./BuildStorage.js";
import { StatCalculator } from "./calc/StatCalculator.js";
import { Build } from "./models/Build.js";
import { BuffPanel } from "./ui/BuffPanel.js";
import { EquipmentPanel } from "./ui/EquipmentPanel.js";
import { EquipmentPickers } from "./ui/EquipmentPickers.js";
import { SkillSheetPanel } from "./ui/SkillSheetPanel.js";
import { StatsPanel } from "./ui/StatsPanel.js";

/** Wires the build model, the calculator and the panels together; re-renders on every change. */
export class BuildPlannerApp {
  constructor(gameDataRepository, rootElements) {
    this.gameDataRepository = gameDataRepository;
    this.rootElements = rootElements;
    this.build = new Build(gameDataRepository);
    this.buildStorage = new BuildStorage();
    this.statCalculator = new StatCalculator(gameDataRepository);

    const equipmentPickers = new EquipmentPickers(gameDataRepository, this.build);
    this.equipmentPanel = new EquipmentPanel(rootElements.equipment, gameDataRepository, this.build, equipmentPickers);
    this.statsPanel = new StatsPanel(rootElements.stats);
    this.buffPanel = new BuffPanel(rootElements.buffs, this.build);
    this.skillSheetPanel = new SkillSheetPanel(rootElements.skills, this.build);
  }

  start() {
    this.build.onChange(() => this.handleBuildChanged());
    this.bindToolbar();
    const savedBuild = this.buildStorage.loadSavedBuild();
    if (savedBuild) {
      this.build.loadJSON(savedBuild);
    } else {
      this.render();
    }
  }

  handleBuildChanged() {
    this.buildStorage.save(this.build);
    this.render();
  }

  render() {
    const statSheet = this.statCalculator.calculate(this.build);
    this.equipmentPanel.render();
    this.statsPanel.render(statSheet);
    this.buffPanel.render();
    this.skillSheetPanel.render(statSheet.activeSkills);
  }

  bindToolbar() {
    const { shareButton, clearDecorationsButton, resetButton, toast } = this.rootElements;
    shareButton.addEventListener("click", async () => {
      const shareUrl = this.buildStorage.createShareUrl(this.build);
      try {
        await navigator.clipboard.writeText(shareUrl);
        this.showToast(toast, "Share link copied to clipboard.");
      } catch {
        window.prompt("Copy this link to share your build:", shareUrl);
      }
    });
    clearDecorationsButton.addEventListener("click", () => this.build.clearAllDecorations());
    resetButton.addEventListener("click", () => {
      if (window.confirm("Clear the entire build?")) this.build.reset();
    });
  }

  showToast(toastElement, message) {
    toastElement.textContent = message;
    toastElement.hidden = false;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => (toastElement.hidden = true), 2500);
  }
}
