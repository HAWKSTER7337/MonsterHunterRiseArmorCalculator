import { createElement, createSelect } from "./dom.js";

const MAX_RENDERED_ROWS = 400;

/**
 * A searchable, filterable, sortable modal list used to pick weapons, armor and decorations.
 *
 * open({
 *   key,                         // filter/sort choices are remembered per key between openings
 *   title, items, renderRow(item), searchText(item),
 *   filters: [{ label, type: "select" | "number", options?, defaultValue, matches(item, value) }],
 *   initialFilterValues: { [filterLabel]: value },   // overrides remembered values for this opening
 *   sortOptions: [{ value, label, compare(first, second, filterValuesByLabel) }],
 *   selectedItem, onSelect(item | null), allowRemove,
 * })
 */
export class PickerDialog {
  constructor() {
    this.rememberedStateByKey = new Map();
    this.dialogElement = createElement("dialog", { className: "picker-dialog" });
    this.titleElement = createElement("h2", { className: "picker-title" });
    this.searchInput = createElement("input", {
      className: "picker-search",
      attributes: { type: "search", placeholder: "Search by name or skill..." },
      onInput: () => this.renderRows(),
    });
    this.filterContainer = createElement("div", { className: "picker-filters" });
    this.countElement = createElement("span");
    this.resetFiltersButton = createElement("button", {
      className: "link-button",
      text: "Reset filters",
      onClick: () => this.resetFilters(),
    });
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
      createElement("div", { className: "picker-controls" }, [this.searchInput]),
      this.filterContainer,
      createElement("div", { className: "picker-count" }, [this.countElement, this.resetFiltersButton]),
      this.listElement,
      createElement("div", { className: "picker-footer" }, [this.removeButton]),
    );
    this.dialogElement.addEventListener("click", (event) => {
      if (event.target === this.dialogElement) this.dialogElement.close();
    });
    document.body.append(this.dialogElement);
  }

  open(pickerOptions) {
    this.pickerOptions = { filters: [], sortOptions: [], ...pickerOptions };
    const rememberedState = this.rememberedStateByKey.get(pickerOptions.key) ?? {};
    this.filterValues = this.pickerOptions.filters.map((filter) =>
      pickerOptions.initialFilterValues?.[filter.label] ?? rememberedState.filterValues?.[filter.label] ?? filter.defaultValue);
    this.sortValue = rememberedState.sortValue ?? this.pickerOptions.sortOptions[0]?.value;

    this.titleElement.textContent = pickerOptions.title;
    this.searchInput.value = "";
    this.removeButton.hidden = !pickerOptions.allowRemove;
    this.renderFilters();
    this.renderRows();
    this.dialogElement.showModal();
    this.searchInput.focus();
  }

  rememberState() {
    const filterValues = Object.fromEntries(
      this.pickerOptions.filters.map((filter, filterIndex) => [filter.label, this.filterValues[filterIndex]]));
    this.rememberedStateByKey.set(this.pickerOptions.key, { filterValues, sortValue: this.sortValue });
  }

  resetFilters() {
    this.filterValues = this.pickerOptions.filters.map((filter) => filter.defaultValue);
    this.sortValue = this.pickerOptions.sortOptions[0]?.value;
    this.searchInput.value = "";
    this.renderFilters();
    this.renderRows();
  }

  renderFilters() {
    const filterControls = this.pickerOptions.filters.map((filter, filterIndex) =>
      createElement("label", { className: "picker-filter" }, [
        createElement("span", { text: filter.label }),
        filter.type === "number"
          ? this.createNumberInput(filterIndex)
          : createSelect(filter.options, this.filterValues[filterIndex], (newValue) => {
            this.filterValues[filterIndex] = newValue;
            this.renderRows();
          }),
      ]));
    const sortControl = this.pickerOptions.sortOptions.length > 0 && createElement("label", { className: "picker-filter" }, [
      createElement("span", { text: "Sort by" }),
      createSelect(this.pickerOptions.sortOptions, this.sortValue, (newValue) => {
        this.sortValue = newValue;
        this.renderRows();
      }),
    ]);
    this.filterContainer.replaceChildren(...[...filterControls, sortControl].filter(Boolean));
  }

  createNumberInput(filterIndex) {
    const input = createElement("input", {
      attributes: { type: "number", min: 0, step: 1, placeholder: "Any" },
      onInput: (event) => {
        this.filterValues[filterIndex] = event.target.value === "" ? "" : Number(event.target.value);
        this.renderRows();
      },
    });
    input.value = this.filterValues[filterIndex] ?? "";
    return input;
  }

  getMatchingItems() {
    const searchTerms = this.searchInput.value.toLowerCase().split(/\s+/).filter(Boolean);
    const { items, filters, searchText, sortOptions } = this.pickerOptions;
    const matchingItems = items.filter((item) => {
      const passesFilters = filters.every((filter, filterIndex) => {
        const filterValue = this.filterValues[filterIndex];
        const isUnset = filterValue === "" || filterValue === null || filterValue === undefined || filterValue === "all";
        return isUnset || filter.matches(item, filterValue);
      });
      if (!passesFilters) return false;
      const haystack = searchText(item).toLowerCase();
      return searchTerms.every((searchTerm) => haystack.includes(searchTerm));
    });
    const sortOption = sortOptions.find((option) => String(option.value) === String(this.sortValue));
    const filterValuesByLabel = Object.fromEntries(
      filters.map((filter, filterIndex) => [filter.label, this.filterValues[filterIndex]]));
    return sortOption
      ? matchingItems.sort((first, second) => sortOption.compare(first, second, filterValuesByLabel))
      : matchingItems;
  }

  renderRows() {
    this.rememberState();
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
      this.listElement.append(createElement("div", { className: "picker-empty", text: "Nothing matches these filters." }));
    }
  }

  choose(item) {
    this.dialogElement.close();
    this.pickerOptions.onSelect(item);
  }
}
