import { createApp } from './src/app.js';
import { config } from './src/config/index.js';
import { ensureSeed } from './src/db/seed.js';
import { startScheduler } from './src/jobs/scheduler.js';

async function main() {
  const app = createApp();
  startScheduler();

  const server = app.listen(config.port, () => {
    const { port } = server.address();
    console.log('');
    console.log('  MT5 Smart Market');
    console.log(`  ─ Frontend & API : http://localhost:${port}`);
    console.log(`  ─ Admin console  : http://localhost:${port}/admin`);
    console.log(`  ─ Admin login    : ${config.admin.email} / ${config.admin.password}`);
    console.log(`  ─ Member login   : ${process.env.MEMBER_EMAIL || 'member@mt5smartmarket.com'} / ${process.env.MEMBER_PASSWORD || 'Member@12345'}`);
    console.log('');
  });

  // Run database warmup and seed checks asynchronously in the background so boot is non-blocking
  Promise.resolve().then(async () => {
    try {
      await ensureSeed();
      console.log('[db] Database pool & seed check complete.');
    } catch (err) {
      console.error('[seed] Warning during initial seed:', err?.message || err);
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
