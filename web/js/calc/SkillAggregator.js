import { SkillEffectCatalog } from "./SkillEffectCatalog.js";

/** A skill as it applies to the build: total points from every source, capped at the skill's max level. */
export class ActiveSkill {
  constructor(skillData) {
    this.skillData = skillData;
    this.totalPoints = 0;
    this.sources = [];
    this.effect = SkillEffectCatalog.getEffect(skillData.id);
  }

  addPoints(sourceName, points) {
    this.totalPoints += points;
    this.sources.push({ sourceName, points });
  }

  get effectiveLevel() {
    return Math.min(this.totalPoints, this.skillData.maxLevel);
  }

  get overflowPoints() {
    return Math.max(0, this.totalPoints - this.skillData.maxLevel);
  }

  get currentLevelDetail() {
    return this.skillData.levelDetails[this.effectiveLevel - 1] ?? "";
  }
}

/** Sums skill points from armor, the talisman and every socketed decoration. */
export class SkillAggregator {
  constructor(gameDataRepository) {
    this.gameDataRepository = gameDataRepository;
  }

  aggregate(build) {
    const activeSkillById = new Map();
    const addSkillPoints = (skillId, points, sourceName) => {
      const skillData = this.gameDataRepository.getSkill(skillId);
      if (!skillData) {
        return;
      }
      if (!activeSkillById.has(skillId)) {
        activeSkillById.set(skillId, new ActiveSkill(skillData));
      }
      activeSkillById.get(skillId).addPoints(sourceName, points);
    };

    build.equippedPieces.forEach((piece) => {
      const pieceName = piece === build.talisman ? "Talisman" : (piece.armorData ?? piece.weaponData).name;
      piece.innateSkills.forEach(({ skillId, level }) => addSkillPoints(skillId, level, pieceName));
      piece.sockets.forEach((socket) => {
        const decoration = this.gameDataRepository.getDecoration(socket.decorationId);
        decoration?.skills.forEach(({ skillId, level }) => addSkillPoints(skillId, level, decoration.name));
      });
    });

    return [...activeSkillById.values()].sort(
      (first, second) =>
        second.effectiveLevel - first.effectiveLevel || first.skillData.name.localeCompare(second.skillData.name),
    );
  }
}
