// Pure search, filter and paging for DataTable's client-side mode.

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim();

function rowSearchText(row, columns) {
  return columns
    .filter((column) => column.searchable !== false)
    .map((column) => (column.searchValue ? column.searchValue(row) : row[column.key]))
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map(normalize)
    .join(" ");
}

/**
 * @param {object[]} rows
 * @param {{ search?: string, filterValues?: Record<string, string>,
 *           columns?: object[], filters?: object[] }} query
 * @returns {object[]}
 */
export function queryRows(rows, { search = "", filterValues = {}, columns = [], filters = [] }) {
  const needle = normalize(search);
  const active = filters.filter((filter) => filterValues[filter.key]);
  return rows.filter((row) => {
    const passesFilters = active.every((filter) => {
      const value = filterValues[filter.key];
      return filter.match ? filter.match(row, value) : String(row[filter.key]) === value;
    });
    return passesFilters && (!needle || rowSearchText(row, columns).includes(needle));
  });
}

/** @returns {number} at least 1, so "page 1 of 1" holds for an empty table. */
export function totalPages(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** @returns {object[]} the rows on a 1-indexed page. */
export function paginate(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** @returns {{ from: number, to: number }} 1-indexed row range; 0-0 when empty. */
export function pageRange(page, pageSize, total) {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from, to: Math.min(from + pageSize - 1, total) };
}
