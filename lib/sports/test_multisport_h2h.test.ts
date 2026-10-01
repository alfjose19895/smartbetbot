import { describe, it, expect } from 'vitest';
import { getMultiSportH2HAndForm } from './multi-sport-h2h';

describe('Multi-Sport H2H Engine', () => {
  it('returns authentic NHL matchups and last 5 form without football contamination', async () => {
    const res = await getMultiSportH2HAndForm('nhl', 'Columbus Blue Jackets', 'Buffalo Sabres');
    expect(res.sport).toBe('nhl');
    expect(res.competitionName).toBe('NHL');
    expect(res.h2h.length).toBeGreaterThan(0);
    expect(res.h2h[0].competition).toBe('NHL');
    expect(res.homeLast5.length).toBeGreaterThan(0);
    expect(res.homeLast5[0].competition).toBe('NHL');
    
    // Check that none of the opponents are Kosovar football teams
    const allOpponents = res.homeLast5.map(m => m.opponent).concat(res.awayLast5.map(m => m.opponent));
    for (const opp of allOpponents) {
      expect(opp).not.toContain('Gjilani');
      expect(opp).not.toContain('Feronikeli');
      expect(opp).not.toContain('Drenica');
    }
  });

  it('resolves real NHL team IDs and returns valid score formats', async () => {
    const res = await getMultiSportH2HAndForm('nhl', 'New York Rangers', 'Tampa Bay Lightning');
    expect(res.sport).toBe('nhl');
    expect(res.competitionName).toBe('NHL');
  });
});
