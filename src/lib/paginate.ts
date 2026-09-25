export type Paginated<T> = {
  items: T[];
  /** Página efectiva (1-based), ya acotada a las que existen. */
  page: number;
  pageCount: number;
  /** Posición (1-based) de la primera y la última fila visibles; 0 si no hay filas. */
  from: number;
  to: number;
  total: number;
};

/**
 * Corta una lista en páginas. Una página fuera de rango (por ejemplo, la
 * última después de eliminar sus filas) se acota a la más cercana.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
  const start = (current - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    items: pageItems,
    page: current,
    pageCount,
    from: pageItems.length ? start + 1 : 0,
    to: start + pageItems.length,
    total,
  };
}

/**
 * Números de página a mostrar: la primera, la última y la actual ±1. `null`
 * marca un salto; un salto de una sola página se muestra como número.
 */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  const shown = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...shown].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const n of pages) {
    const previous = result.at(-1);
    if (typeof previous === "number" && n - previous === 2) result.push(n - 1);
    else if (typeof previous === "number" && n - previous > 2) result.push(null);
    result.push(n);
  }
  return result;
}
