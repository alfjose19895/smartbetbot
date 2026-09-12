import { describe, it } from 'vitest';
import { searchAndAddNewAlerts, loadDailySnapshot, getEcuadorDateString } from './db';

describe('Test searchAndAddNewAlerts Execution', () => {
  it('executes searchAndAddNewAlerts and checks newly discovered alerts', async () => {
    const today = getEcuadorDateString(Date.now());
    const beforeSnap = loadDailySnapshot(today) || [];
    console.log(`Snapshot before search (${today}):`, beforeSnap.length, 'picks');

    const res = await searchAndAddNewAlerts();
    console.log('searchAndAddNewAlerts result:', {
      success: res.success,
      count: res.count,
      newCount: res.newCount,
      newAlertsCount: res.newAlerts?.length,
      message: res.message,
    });

    if (res.newAlerts && res.newAlerts.length > 0) {
      console.log('Sample newly discovered alerts:');
      for (const a of res.newAlerts.slice(0, 5)) {
        console.log(`- [${(a.pickBadge || 'ESTANDAR').toUpperCase()}] ${a.homeTeam} vs ${a.awayTeam} | ${a.market}: ${a.pick} | Odds: ${a.odds} | Kickoff: ${a.kickoff}`);
      }
    }
  });
});
