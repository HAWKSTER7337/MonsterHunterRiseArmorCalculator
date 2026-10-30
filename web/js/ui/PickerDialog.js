import { createElement, createSelect } from "./dom.js";

const MAX_RENDERED_ROWS = 400;

/**
 * A searchable, filterable modal list used to pick weapons, armor and decorations.
 *
 * open({
 *   title, items, renderRow(item), searchText(item),
 *   filters: [{ label, options: [{value, label}], initialValue, matches(item, value) }],
 *   selectedItem, onSelect(item | null), allowRemove,
 * })
 */
export class PickerDialog {
  constructor() {
    this.dialogElement = createElement("dialog", { className: "picker-dialog" });
    this.titleElement = createElement("h2", { className: "picker-title" });
    this.searchInput = createElement("input", {
      className: "picker-search",
      attributes: { type: "search", placeholder: "Search by name or skill..." },
      onInput: () => this.renderRows(),
    });
    this.filterContainer = createElement("div", { className: "picker-filters" });
    this.countElement = createElement("div", { className: "picker-count" });
    this.listElement = createElement("div", { className: "picker-list" });
    this.removeButton = createElement("button", {
      className: "button button-danger",
      text: "Remove",
      onClick: () => this.choose(null),
    });
    const closeButton = createElement("button", {
      className: "button",
      text: "Close",
      onClick: () => this.dialogElement.close(),
    });

    this.dialogElement.append(
      createElement("div", { className: "picker-header" }, [this.titleElement, closeButton]),
      createElement("div", { className: "picker-controls" }, [this.searchInput, this.filterContainer]),
      this.countElement,
      this.listElement,
      createElement("div", { className: "picker-footer" }, [this.removeButton]),
    );
    this.dialogElement.addEventListener("click", (event) => {
      if (event.target === this.dialogElement) this.dialogElement.close();
    });
    document.body.append(this.dialogElement);
  }

  open(pickerOptions) {
    this.pickerOptions = pickerOptions;
    this.filterValues = (pickerOptions.filters ?? []).map((filter) => filter.initialValue ?? filter.options[0].value);
    this.titleElement.textContent = pickerOptions.title;
    this.searchInput.value = "";
    this.removeButton.hidden = !pickerOptions.allowRemove;
    this.renderFilters();
    this.renderRows();
    this.dialogElement.showModal();
    this.searchInput.focus();
  }

  renderFilters() {
    this.filterContainer.replaceChildren(
      ...(this.pickerOptions.filters ?? []).map((filter, filterIndex) =>
        createElement("label", { className: "picker-filter" }, [
          createElement("span", { text: filter.label }),
          createSelect(filter.options, this.filterValues[filterIndex], (newValue) => {
            this.filterValues[filterIndex] = newValue;
            this.renderRows();
          }),
        ]),
      ),
    );
  }

  getMatchingItems() {
    const searchTerms = this.searchInput.value.toLowerCase().split(/\s+/).filter(Boolean);
    const { items, filters = [], searchText } = this.pickerOptions;
    return items.filter((item) => {
      const passesFilters = filters.every((filter, filterIndex) => filter.matches(item, this.filterValues[filterIndex]));
      if (!passesFilters) return false;
      const haystack = searchText(item).toLowerCase();
      return searchTerms.every((searchTerm) => haystack.includes(searchTerm));
    });
  }

  renderRows() {
    const matchingItems = this.getMatchingItems();
    const renderedItems = matchingItems.slice(0, MAX_RENDERED_ROWS);
    this.countElement.textContent = matchingItems.length > MAX_RENDERED_ROWS
      ? `Showing ${MAX_RENDERED_ROWS} of ${matchingItems.length} results. Refine your search to see more.`
      : `${matchingItems.length} result${matchingItems.length === 1 ? "" : "s"}`;
    this.listElement.replaceChildren(
      ...renderedItems.map((item) => {
        const isSelected = item === this.pickerOptions.selectedItem;
        return createElement(
          "button",
          { className: `picker-row${isSelected ? " selected" : ""}`, onClick: () => this.choose(item) },
          [this.pickerOptions.renderRow(item)],
        );
      }),
    );
    if (renderedItems.length === 0) {
      this.listElement.append(createElement("div", { className: "picker-empty", text: "Nothing matches." }));
    }
  }

  choose(item) {
    this.dialogElement.close();
    this.pickerOptions.onSelect(item);
  }
}
