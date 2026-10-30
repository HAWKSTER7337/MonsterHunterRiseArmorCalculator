/**
 * Small element factory: createElement("div", { className: "row", text: "Hi", onClick }, [children]).
 * Children may be elements, strings, or null/false (skipped).
 */
export function createElement(tagName, options = {}, children = []) {
  const element = document.createElement(tagName);
  const { className, text, title, attributes, onClick, onChange, onInput, dataset } = options;
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (title) element.title = title;
  if (attributes) {
    Object.entries(attributes).forEach(([attributeName, attributeValue]) => {
      if (attributeValue === true) element.setAttribute(attributeName, "");
      else if (attributeValue !== false && attributeValue !== null && attributeValue !== undefined) {
        element.setAttribute(attributeName, String(attributeValue));
      }
    });
  }
  if (dataset) Object.assign(element.dataset, dataset);
  if (onClick) element.addEventListener("click", onClick);
  if (onChange) element.addEventListener("change", onChange);
  if (onInput) element.addEventListener("input", onInput);
  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return element;
}

export function createSlotIcon(slotLevel, isFilled = false) {
  return createElement("span", {
    className: `slot-icon level-${slotLevel}${isFilled ? " filled" : ""}`,
    text: slotLevel,
    title: `Level ${slotLevel} slot`,
  });
}

export function createRarityBadge(rarity) {
  return createElement("span", { className: `rarity-badge rarity-${rarity}`, text: `R${rarity}` });
}

export function createSelect(options, selectedValue, onChange, className = "") {
  const selectElement = createElement("select", { className, onChange: (event) => onChange(event.target.value) });
  options.forEach(({ value, label }) => {
    const optionElement = createElement("option", { text: label, attributes: { value } });
    optionElement.selected = String(value) === String(selectedValue);
    selectElement.append(optionElement);
  });
  return selectElement;
}

export function formatNumber(value, fractionDigits = 0) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
