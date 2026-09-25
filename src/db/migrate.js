import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Applies the SQL migrations in src/db/migrations to the database.
 * Uses DIRECT_URL (the non-pooled Supabase connection) so DDL runs cleanly.
 *
 *   npm run db:generate   # after editing schema.js — writes new migration SQL
 *   npm run db:migrate    # apply pending migrations
 */

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DIRECT_URL (or DATABASE_URL) in .env before running migrations.');
  process.exit(1);
}

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const sql = postgres(url, { max: 1, ssl: 'require', prepare: false });
const db = drizzle(sql);

migrate(db, { migrationsFolder })
  .then(() => {
    console.log('Migrations applied.');
    return sql.end();
  })
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await sql.end().catch(() => {});
    process.exit(1);
  });
