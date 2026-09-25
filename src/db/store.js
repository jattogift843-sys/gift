/**
 * The data store. Backed by Supabase Postgres via Drizzle (see ./pg-store.js).
 *
 * The `Collection` API (all / find / findOne / findById / insert / update /
 * updateWhere / remove / count) is unchanged in shape, but every method now
 * returns a Promise — callers must `await`.
 */
export { db, orm } from './pg-store.js';
