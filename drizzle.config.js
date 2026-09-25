import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config — used for `npm run db:generate` (create SQL migrations
 * from src/db/schema.js) and `npm run db:studio`.
 *
 * Migrations run against DIRECT_URL (the non-pooled Supabase connection);
 * the app itself connects through DATABASE_URL (the pooler).
 */
export default defineConfig({
  schema: './src/db/schema.js',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
