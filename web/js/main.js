import { BuildPlannerApp } from "./BuildPlannerApp.js";
import { GameDataRepository } from "./data/GameDataRepository.js";

const byId = (elementId) => document.getElementById(elementId);

try {
  const gameDataRepository = await GameDataRepository.load("data/game-data.json", "images/weapons/renders.json");
  const app = new BuildPlannerApp(gameDataRepository, {
    equipment: byId("equipment-panel"),
    stats: byId("stats-panel"),
    buffs: byId("buff-panel"),
    skills: byId("skill-panel"),
    shareButton: byId("share-button"),
    clearDecorationsButton: byId("clear-decorations-button"),
    resetButton: byId("reset-button"),
    toast: byId("toast"),
  });
  app.start();
  byId("loading").hidden = true;
} catch (error) {
  byId("loading").textContent = `Could not start the simulator: ${error.message}`;
  console.error(error);
}
