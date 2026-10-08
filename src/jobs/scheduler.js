import { config } from '../config/index.js';
import { accrueDueInvestments } from '../services/investment.service.js';
import { runDueRobots } from '../services/robot.service.js';

/**
 * Background engines:
 *  - ROI accrual on active investments (every ACCRUAL_INTERVAL_MINUTES)
 *  - automated trading robots (every ROBOT_TICK_MINUTES; each robot is gated
 *    by its own interval)
 * Both run once on boot to catch up anything missed while the server was down.
 */
export function startScheduler() {
  const accrualMs = Math.max(1, config.accrualIntervalMinutes) * 60 * 1000;
  const robotMs = Math.max(1, config.robotTickMinutes) * 60 * 1000;

  const runAccrual = async () => {
    try {
      const r = await accrueDueInvestments();
      if (r.payouts || r.completed) {
        console.log(`[scheduler] accrual: ${r.payouts} payout(s) totalling ${r.paidAmount}, ${r.completed} completed`);
      }
    } catch (err) {
      console.error('[scheduler] accrual failed:', err.message);
    }
  };

  const runRobots = async () => {
    try {
      const r = await runDueRobots();
      if (r.ran) console.log(`[scheduler] robots: ${r.ran} trade(s), net ${r.netPnl}`);
    } catch (err) {
      console.error('[scheduler] robots failed:', err.message);
    }
  };

  // Stagger initial execution by 5 seconds so server boot HTTP requests take priority
  setTimeout(() => {
    runAccrual();
    runRobots();
  }, 5000);

  const t1 = setInterval(runAccrual, accrualMs);
  const t2 = setInterval(runRobots, robotMs);
  t1.unref?.();
  t2.unref?.();
  console.log(`[scheduler] ROI accrual every ${config.accrualIntervalMinutes} min · robots every ${config.robotTickMinutes} min`);
  return [t1, t2];
}
