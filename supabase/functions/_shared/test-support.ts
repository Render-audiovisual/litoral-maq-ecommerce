// Doble mínimo del query builder de postgrest-js/supabase-js, solo para
// tests de Deno — mismo criterio que el FakeQueryBuilder de
// src/services/persistence/supabase-adapter.test.ts ("para poder testearse
// con un cliente falso, sin tocar la red"), adaptado a los métodos que
// realmente usan las Edge Functions de este árbol (eq/is/lt/select/
// maybeSingle, más auth.getUser).
// deno-lint-ignore-file no-explicit-any

export type Row = Record<string, any>;

function pick(row: Row, cols: string | null): Row {
  const clone = { ...row };
  if (!cols || cols === "*") return clone;
  const wanted = cols.split(",").map((c) => c.trim());
  const result: Row = {};
  for (const key of wanted) result[key] = clone[key];
  return result;
}

class FakeQuery implements PromiseLike<{ data: Row | null; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private cols: string | null = null;

  constructor(
    private store: Map<string, Row>,
    private table: string,
    private mode: "select" | "update",
    private failUpdate: ((table: string, patch: Row) => boolean) | null,
    private patch?: Row,
  ) {}

  select(cols: string) {
    this.cols = cols;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  is(col: string, value: null) {
    this.filters.push((row) => (row[col] ?? null) === value);
    return this;
  }
  lt(col: string, value: string) {
    this.filters.push((row) => typeof row[col] === "string" && (row[col] as string) < value);
    return this;
  }

  private match(): Row | undefined {
    for (const row of this.store.values()) {
      if (this.filters.every((predicate) => predicate(row))) return row;
    }
    return undefined;
  }

  private execute(): { data: Row | null; error: { message: string } | null } {
    const row = this.match();
    if (this.mode === "select") return { data: row ? pick(row, this.cols) : null, error: null };

    if (!row) return { data: null, error: null };
    if (this.failUpdate?.(this.table, this.patch ?? {})) {
      return { data: null, error: { message: "simulated failure" } };
    }
    Object.assign(row, this.patch);
    return { data: pick(row, this.cols), error: null };
  }

  maybeSingle() {
    return Promise.resolve(this.execute());
  }

  then<T1 = { data: Row | null; error: { message: string } | null }, T2 = never>(
    onfulfilled?: ((value: { data: Row | null; error: { message: string } | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

class FakeTable {
  constructor(
    private store: Map<string, Row>,
    private table: string,
    private failUpdate: ((table: string, patch: Row) => boolean) | null,
  ) {}
  select(cols: string) {
    return new FakeQuery(this.store, this.table, "select", this.failUpdate).select(cols);
  }
  update(patch: Row) {
    return new FakeQuery(this.store, this.table, "update", this.failUpdate, patch);
  }
}

/** Cliente falso mínimo: soporta lo que usan requireStaff() y las Edge
 * Functions andreani-* sobre las tablas `profiles` y `orders`. */
export class FakeAdminClient {
  tables: { profiles: Map<string, Row>; orders: Map<string, Row> } = {
    profiles: new Map(),
    orders: new Map(),
  };
  private authUsers = new Map<string, string>(); // token -> user id

  /** Falla las próximas updates que matcheen el predicado — para simular
   * timeouts/errores intermitentes de guardado (ver punto 5 del pedido). */
  failUpdate: ((table: string, patch: Row) => boolean) | null = null;

  setAuthUser(token: string, userId: string) {
    this.authUsers.set(token, userId);
  }

  auth = {
    getUser: (token: string) => {
      const userId = this.authUsers.get(token);
      if (!userId) return Promise.resolve({ data: { user: null }, error: new Error("invalid token") });
      return Promise.resolve({ data: { user: { id: userId } }, error: null });
    },
  };

  from(table: "profiles" | "orders") {
    return new FakeTable(this.tables[table], table, this.failUpdate);
  }
}
