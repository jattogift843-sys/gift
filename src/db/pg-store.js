import { and, asc, eq, sql as raw } from 'drizzle-orm';
import { orm } from './client.js';
import { tables } from './schema.js';

/**
 * Postgres-backed document store. Same method names as the legacy JSON
 * `Collection` (`all`, `find`, `findOne`, `findById`, `insert`, `update`,
 * `updateWhere`, `remove`, `count`) so service-layer changes are limited to
 * adding `await`.
 *
 * `find` / `findOne` / `count` accept EITHER:
 *   - a plain object of column→value equality  → compiled to a SQL WHERE
 *     (fast: one indexed round-trip)
 *   - a predicate function                     → loads the collection and
 *     filters in memory (slow, kept for the long tail of complex filters)
 */

const nowISO = () => new Date().toISOString();

class Collection {
  constructor(name) {
    this.name = name;
    this.table = tables[name];
  }

  #whereFromObject(obj) {
    const clauses = Object.entries(obj)
      .filter(([col]) => this.table[col] !== undefined)
      .map(([col, val]) => eq(this.table[col], val));
    return clauses.length ? and(...clauses) : undefined;
  }

  #baseQuery(where) {
    const q = orm.select().from(this.table);
    return (where ? q.where(where) : q).orderBy(asc(this.table.seq));
  }

  async all() {
    return this.#baseQuery();
  }

  async find(filter) {
    if (typeof filter === 'function') {
      return (await this.all()).filter(filter);
    }
    if (filter && typeof filter === 'object') {
      return this.#baseQuery(this.#whereFromObject(filter));
    }
    return this.all();
  }

  async findOne(filter) {
    if (typeof filter === 'function') {
      return (await this.all()).find(filter) ?? null;
    }
    if (filter && typeof filter === 'object') {
      const rows = await orm.select().from(this.table)
        .where(this.#whereFromObject(filter))
        .limit(1);
      return rows[0] ?? null;
    }
    return null;
  }

  async findById(id) {
    if (id == null) return null;
    const rows = await orm.select().from(this.table).where(eq(this.table.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async insert(doc) {
    const row = { ...doc };
    if (this.table.createdAt && row.createdAt === undefined) row.createdAt = nowISO();
    const [inserted] = await orm.insert(this.table).values(row).returning();
    return inserted;
  }

  async update(id, patch) {
    const data = { ...patch };
    delete data.seq;
    if (this.table.updatedAt) data.updatedAt = nowISO();
    if (Object.keys(data).length === 0) return this.findById(id);
    const [updated] = await orm.update(this.table).set(data).where(eq(this.table.id, id)).returning();
    return updated ?? null;
  }

  /** Apply `mutate(row)` (which returns the full next row) to every match. */
  async updateWhere(predicate, mutate) {
    const rows = (await this.all()).filter(predicate);
    for (const row of rows) {
      const next = { ...mutate(row) };
      delete next.seq;
      delete next.id;
      await this.update(row.id, next);
    }
    return rows.length;
  }

  async remove(id) {
    const res = await orm
      .delete(this.table)
      .where(eq(this.table.id, id))
      .returning({ id: this.table.id });
    return res.length > 0;
  }

  async count(filter) {
    if (typeof filter === 'function') {
      return (await this.find(filter)).length;
    }
    const where = filter && typeof filter === 'object'
      ? this.#whereFromObject(filter)
      : undefined;
    const q = orm.select({ n: raw`count(*)::int` }).from(this.table);
    const [row] = await (where ? q.where(where) : q);
    return row?.n ?? 0;
  }
}

export const db = Object.fromEntries(
  Object.keys(tables).map((name) => [name, new Collection(name)]),
);

export { orm };
