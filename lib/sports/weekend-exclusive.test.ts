import { describe, it, expect } from 'vitest';
import {
  getWeekendCycleInfo,
  getWeekendExclusiveRuleMatch,
  isWeekendExclusivePick,
  WEEKEND_EXCLUSIVE_RULES,
  WEEKEND_EXCLUSIVE_TARGET_COUNT,
  getPickDayOfWeek,
} from './weekend-exclusive';

describe('Módulo Exclusivo Fin de Semana (Weekend Exclusive Engine)', () => {
  it('defines the 5 golden football rules accurately', () => {
    expect(WEEKEND_EXCLUSIVE_RULES).toHaveLength(5);
    expect(WEEKEND_EXCLUSIVE_TARGET_COUNT).toBe(15);

    const corners = WEEKEND_EXCLUSIVE_RULES.find((r) => r.id === 'corners');
    expect(corners?.minProb).toBe(70);

    const btts = WEEKEND_EXCLUSIVE_RULES.find((r) => r.id === 'btts');
    expect(btts?.minProb).toBe(58);

    const goals = WEEKEND_EXCLUSIVE_RULES.find((r) => r.id === 'goals');
    expect(goals?.minProb).toBe(72);

    const local = WEEKEND_EXCLUSIVE_RULES.find((r) => r.id === 'local');
    expect(local?.minProb).toBe(58);

    const away = WEEKEND_EXCLUSIVE_RULES.find((r) => r.id === 'away');
    expect(away?.minProb).toBe(71);
  });

  describe('Cycle unlock timing logic (America/Guayaquil)', () => {
    it('is locked on Friday at 05:59:00 AM (before 6:00 AM)', () => {
      // 2026-10-16 05:59:00 Ecuador time (UTC-5 -> 10:59:00 UTC)
      const fridayEarly = new Date('2026-10-16T10:59:00Z');
      const info = getWeekendCycleInfo(fridayEarly);

      expect(info.isUnlocked).toBe(false);
      expect(info.fridayDate).toBe('2026-10-16');
      expect(info.saturdayDate).toBe('2026-10-17');
      expect(info.sundayDate).toBe('2026-10-18');
      expect(info.msUntilUnlock).toBeGreaterThan(0);
      expect(info.countdown.minutes).toBeLessThanOrEqual(1);
    });

    it('is unlocked on Friday at 06:00:00 AM sharp', () => {
      // 2026-10-16 06:00:00 Ecuador time (UTC-5 -> 11:00:00 UTC)
      const fridayUnlocked = new Date('2026-10-16T11:00:00Z');
      const info = getWeekendCycleInfo(fridayUnlocked);

      expect(info.isUnlocked).toBe(true);
      expect(info.fridayDate).toBe('2026-10-16');
      expect(info.saturdayDate).toBe('2026-10-17');
      expect(info.sundayDate).toBe('2026-10-18');
      expect(info.msUntilUnlock).toBe(0);
    });

    it('remains unlocked throughout Saturday and Sunday', () => {
      // Saturday 2026-10-17 14:00 Ecuador (19:00 UTC)
      const saturday = new Date('2026-10-17T19:00:00Z');
      const infoSat = getWeekendCycleInfo(saturday);
      expect(infoSat.isUnlocked).toBe(true);
      expect(infoSat.fridayDate).toBe('2026-10-16');
      expect(infoSat.saturdayDate).toBe('2026-10-17');
      expect(infoSat.sundayDate).toBe('2026-10-18');

      // Sunday 2026-10-18 22:30 Ecuador (03:30 UTC next day)
      const sunday = new Date('2026-10-19T03:30:00Z'); // 2026-10-18 22:30 in Ecuador
      const infoSun = getWeekendCycleInfo(sunday);
      expect(infoSun.isUnlocked).toBe(true);
      expect(infoSun.fridayDate).toBe('2026-10-16');
    });

    it('is locked on Monday and counts down to upcoming Friday 6:00 AM', () => {
      // Monday 2026-10-19 10:00 Ecuador (15:00 UTC)
      const monday = new Date('2026-10-19T15:00:00Z');
      const info = getWeekendCycleInfo(monday);

      expect(info.isUnlocked).toBe(false);
      expect(info.fridayDate).toBe('2026-10-23');
      expect(info.saturdayDate).toBe('2026-10-24');
      expect(info.sundayDate).toBe('2026-10-25');
      expect(info.countdown.days).toBe(3); // 3 days and some hours
    });

    it('is locked on Thursday and counts down hours to Friday', () => {
      // Thursday 2026-10-15 12:00 Ecuador (17:00 UTC)
      const thursday = new Date('2026-10-15T17:00:00Z');
      const info = getWeekendCycleInfo(thursday);

      expect(info.isUnlocked).toBe(false);
      expect(info.fridayDate).toBe('2026-10-16');
      expect(info.countdown.days).toBe(0);
      expect(info.countdown.hours).toBe(18); // 12pm Thu to 6am Fri = 18 hours
    });
  });

  describe('Rule qualifying validation', () => {
    it('validates corner pick >= 70%', () => {
      const valid = {
        sport: 'football',
        market: 'Córners',
        selection: 'Over 8.5',
        probability: 70.5,
      };
      expect(isWeekendExclusivePick(valid)).toBe(true);
      expect(getWeekendExclusiveRuleMatch(valid)?.ruleId).toBe('corners');
    });

    it('validates BTTS pick >= 58%', () => {
      const valid = {
        sport: 'football',
        market: 'Ambos Equipos Anotan',
        selection: 'Sí',
        probability: 59.0,
      };
      expect(isWeekendExclusivePick(valid)).toBe(true);
      expect(getWeekendExclusiveRuleMatch(valid)?.ruleId).toBe('btts');
    });

    it('validates goals pick >= 72%', () => {
      const valid = {
        sport: 'football',
        market: 'Over 2.5 Goles',
        selection: 'Over 2.5',
        probability: 75.0,
      };
      expect(isWeekendExclusivePick(valid)).toBe(true);
      expect(getWeekendExclusiveRuleMatch(valid)?.ruleId).toBe('goals');
    });

    it('validates local win >= 58%', () => {
      const valid = {
        sport: 'football',
        market: 'Ganador Local',
        selection: '1',
        probability: 58.5,
      };
      expect(isWeekendExclusivePick(valid)).toBe(true);
      expect(getWeekendExclusiveRuleMatch(valid)?.ruleId).toBe('local');
    });

    it('validates away win >= 71%', () => {
      const valid = {
        sport: 'football',
        market: 'Ganador Visitante',
        selection: '2',
        probability: 72.0,
      };
      expect(isWeekendExclusivePick(valid)).toBe(true);
      expect(getWeekendExclusiveRuleMatch(valid)?.ruleId).toBe('away');
    });

    it('strictly excludes non-football sports', () => {
      const nhl = {
        sport: 'nhl',
        market: 'Over 5.5 Goles',
        selection: 'Over 5.5',
        probability: 85.0,
      };
      expect(isWeekendExclusivePick(nhl)).toBe(false);
    });
  });

  describe('Day attribution', () => {
    it('assigns correct day label and day of week based on kickoff date', () => {
      const friPick = {
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        kickoff: '2026-10-16T20:00:00Z',
      } as unknown as import('./prediction-engine').MarketOpportunity;

      const satPick = {
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        kickoff: '2026-10-17T15:00:00Z',
      } as unknown as import('./prediction-engine').MarketOpportunity;

      const sunPick = {
        homeTeam: 'Inter',
        awayTeam: 'Juventus',
        kickoff: '2026-10-18T19:45:00Z',
      } as unknown as import('./prediction-engine').MarketOpportunity;

      expect(getPickDayOfWeek(friPick, '2026-10-16', '2026-10-17', '2026-10-18').dayOfWeek).toBe('friday');
      expect(getPickDayOfWeek(satPick, '2026-10-16', '2026-10-17', '2026-10-18').dayOfWeek).toBe('saturday');
      expect(getPickDayOfWeek(sunPick, '2026-10-16', '2026-10-17', '2026-10-18').dayOfWeek).toBe('sunday');
    });
  });

  describe('Slate assembly', () => {
    it('compiles slate object with cycle and stats structure without crashing', async () => {
      const { getWeekendExclusiveSlate } = await import('./weekend-exclusive');
      const slate = await getWeekendExclusiveSlate({
        refDate: new Date('2026-10-16T15:00:00Z'),
      });

      expect(slate).toBeDefined();
      expect(slate.cycle).toBeDefined();
      expect(slate.cycle.fridayDate).toBe('2026-10-16');
      expect(slate.targetCount).toBe(15);
      expect(slate.stats).toBeDefined();
      expect(slate.stats.byRule).toBeDefined();
      expect(slate.stats.byDay).toBeDefined();
    });
  });
});
