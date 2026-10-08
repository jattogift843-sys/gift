import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

/**
 * Postgres connection for the running app.
 *
 * DATABASE_URL must be set — on Supabase this is the *Transaction pooler*
 * connection (port 6543). `prepare: false` is required because that pooler
 * (PgBouncer in transaction mode) does not support prepared statements.
 */

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
if (!url) {
  throw new Error(
    'DATABASE_URL or DIRECT_URL is not set. Add your Supabase connection string to .env.',
  );
}

export const sql = postgres(url, {
  prepare: false,
  ssl: 'require',
  max: Number(process.env.PG_POOL_MAX || 10),
  idle_timeout: 30,
  connect_timeout: 10,
  max_lifetime: 60 * 15,
  keep_alive: 10,
  connection: { statement_timeout: 15000 },
  onnotice: () => {},
});

export const orm = drizzle(sql, { schema, casing: 'snake_case' });

export async function closeDatabase() {
  await sql.end({ timeout: 5 });
}
