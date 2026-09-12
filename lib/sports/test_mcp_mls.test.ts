import { describe, it, expect } from 'vitest';
import { searchLiveMarketDynamic } from './db';

describe('MCP MLS Dynamic Search', () => {
  it('searches for MLS and returns strictly MLS fixtures', async () => {
    const opps = await searchLiveMarketDynamic({
      query: 'Pronósticos de la MLS para hoy',
      league: 'Major League Soccer',
      leagueId: 253,
    });

    console.log(`Found ${opps.length} opportunities for MLS query`);
    for (const op of opps) {
      console.log(`- [${op.league} / ${op.country}] ${op.homeTeam} vs ${op.awayTeam} | ${op.market}: ${op.pick || op.selection} | Kickoff: ${op.kickoff}`);
      // Check if any non-MLS league is present
      const isMls = (op.league || '').toLowerCase().includes('major league soccer') || (op.country || '').toLowerCase().includes('usa');
      expect(isMls).toBe(true);
    }
  });
});
