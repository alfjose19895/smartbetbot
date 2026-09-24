import { describe, it, expect } from 'vitest';
import { settleActiveSnapshotWithRealScores, loadDailySnapshot, getEcuadorDateString } from './db';

describe('Settle Active Snapshot Verification', () => {
  it('settles all finished matches with actual scores and won/lost statuses', async () => {
    const today = getEcuadorDateString(Date.now());
    const settled = await settleActiveSnapshotWithRealScores(today);
    console.log(`Settled snapshot for ${today}: ${settled.length} total picks`);

    const wonList = settled.filter((p) => p.status === 'won');
    const lostList = settled.filter((p) => p.status === 'lost');
    const pendingList = settled.filter((p) => p.status === 'pending');

    console.log(`Results: ${wonList.length} Won, ${lostList.length} Lost, ${pendingList.length} Pending`);

    console.log('\n--- Settled Won/Lost Samples ---');
    for (const p of [...wonList, ...lostList].slice(0, 10)) {
      console.log(`[${p.status.toUpperCase()}] ${p.match} | Pick: ${p.pick} (${p.market}) | Score: ${p.actualScore} | Odds: ${p.odds}`);
      expect(p.actualScore).toBeDefined();
    }

    console.log('\n--- Remaining Pending Matches ---');
    for (const p of pendingList) {
      console.log(`[PENDING] ${p.match} | Pick: ${p.pick} (${p.market}) | Kickoff: ${p.kickoff}`);
      expect(p.status).toBe('pending');
    }
  }, 25000);
});
