export const SHARPNESS_COLORS = ["red", "orange", "yellow", "green", "blue", "white", "purple"];

const RAW_SHARPNESS_MULTIPLIERS = [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39];
const ELEMENT_SHARPNESS_MULTIPLIERS = [0.25, 0.5, 0.75, 1.0, 1.0625, 1.15, 1.25];

/** The sharpness bar of a melee weapon after Handicraft has been applied. */
export class SharpnessBar {
  constructor(segmentLengths) {
    this.segmentLengths = segmentLengths;
  }

  get topColorIndex() {
    return this.segmentLengths.findLastIndex((segmentLength) => segmentLength > 0);
  }

  get topColorName() {
    return SHARPNESS_COLORS[this.topColorIndex];
  }

  get totalLength() {
    return this.segmentLengths.reduce((total, segmentLength) => total + segmentLength, 0);
  }

  get rawMultiplier() {
    return RAW_SHARPNESS_MULTIPLIERS[this.topColorIndex] ?? 1;
  }

  get elementMultiplier() {
    return ELEMENT_SHARPNESS_MULTIPLIERS[this.topColorIndex] ?? 1;
  }
}

export class SharpnessCalculator {
  /**
   * Handicraft points are spent in order through the weapon's handicraft list: the first entry
   * extends the bar's current top color, the second entry the next color up, and so on.
   */
  static calculate(baseSegmentLengths, handicraftIncrements, handicraftPoints) {
    if (!baseSegmentLengths) {
      return null;
    }
    const segmentLengths = [...baseSegmentLengths];
    const baseTopColorIndex = segmentLengths.findLastIndex((segmentLength) => segmentLength > 0);
    let remainingPoints = handicraftPoints;
    (handicraftIncrements ?? []).forEach((incrementCapacity, incrementIndex) => {
      const colorIndex = Math.min(baseTopColorIndex + incrementIndex, SHARPNESS_COLORS.length - 1);
      const pointsSpent = Math.min(remainingPoints, incrementCapacity);
      segmentLengths[colorIndex] += pointsSpent;
      remainingPoints -= pointsSpent;
    });
    return new SharpnessBar(segmentLengths);
  }
}
