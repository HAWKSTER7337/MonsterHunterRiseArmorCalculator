import { SHARPNESS_COLORS } from "../calc/SharpnessCalculator.js";
import { createElement } from "./dom.js";

const FULL_BAR_LENGTH = 400;

export class SharpnessBarView {
  /** Renders segment lengths as a proportional colored bar (the game's bar is 400 units long). */
  static render(segmentLengths, isCompact = false) {
    const barElement = createElement("div", { className: `sharpness-bar${isCompact ? " compact" : ""}` });
    segmentLengths.forEach((segmentLength, colorIndex) => {
      if (segmentLength <= 0) return;
      const segmentElement = createElement("div", {
        className: `sharpness-segment sharpness-${SHARPNESS_COLORS[colorIndex]}`,
        title: `${SHARPNESS_COLORS[colorIndex]}: ${segmentLength}`,
      });
      segmentElement.style.width = `${(segmentLength / FULL_BAR_LENGTH) * 100}%`;
      barElement.append(segmentElement);
    });
    return barElement;
  }
}
