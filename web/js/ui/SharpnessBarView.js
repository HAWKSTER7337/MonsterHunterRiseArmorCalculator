import { SHARPNESS_COLORS } from "../calc/SharpnessCalculator.js";
import { createElement } from "./dom.js";

const FULL_BAR_LENGTH = 400;

export class SharpnessBarView {
  /**
   * Renders segment lengths as a proportional colored bar (the game's bar is 400 units long).
   * When `extendedSegmentLengths` is given (e.g. the bar at Handicraft 5), the extra length per color
   * is drawn faded right after that color's base segment.
   */
  static render(segmentLengths, isCompact = false, extendedSegmentLengths = null) {
    const barElement = createElement("div", { className: `sharpness-bar${isCompact ? " compact" : ""}` });
    segmentLengths.forEach((segmentLength, colorIndex) => {
      const colorName = SHARPNESS_COLORS[colorIndex];
      const extraLength = extendedSegmentLengths ? extendedSegmentLengths[colorIndex] - segmentLength : 0;
      barElement.append(
        ...SharpnessBarView.createSegment(segmentLength, colorName, ""),
        ...SharpnessBarView.createSegment(extraLength, colorName, " handicraft-extension", " (from Handicraft)"),
      );
    });
    return barElement;
  }

  static createSegment(segmentLength, colorName, extraClassName, titleSuffix = "") {
    if (segmentLength <= 0) return [];
    const segmentElement = createElement("div", {
      className: `sharpness-segment sharpness-${colorName}${extraClassName}`,
      title: `${colorName}: ${segmentLength}${titleSuffix}`,
    });
    segmentElement.style.width = `${(segmentLength / FULL_BAR_LENGTH) * 100}%`;
    return [segmentElement];
  }
}
