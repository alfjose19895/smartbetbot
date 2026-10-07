/* eslint-disable */
import { describe, it, expect } from 'vitest';
import { matchesMarketFilter, normalizeMarketFilterString } from './registry';

describe('Market Filter - normalizeMarketFilterString', () => {
  it('handles accents and special characters cleanly', () => {
    expect(normalizeMarketFilterString('Over Córners')).toBe('overcorners');
    expect(normalizeMarketFilterString('Córners')).toBe('corners');
    expect(normalizeMarketFilterString('Over 2.5 Goles')).toBe('over25goles');
    expect(normalizeMarketFilterString('Ambos Equipos Anotan')).toBe('ambosequiposanotan');
    expect(normalizeMarketFilterString('Más de 9.5')).toBe('masde95');
  });
});

describe('Market Filter - matchesMarketFilter', () => {
  describe('Corner market filtering isolation', () => {
    it('matches valid corner signals with Over Córners filter', () => {
      expect(matchesMarketFilter('Over Córners', 'Over Córners', 'Más de 9.5')).toBe(true);
      expect(matchesMarketFilter('Over Córners', 'Córners', 'Over 9.5')).toBe(true);
      expect(matchesMarketFilter('Over Córners', 'Total Córners', 'Más de 8.5 Córners')).toBe(true);
      expect(matchesMarketFilter('Córners', 'Córners', 'Más de 9.5')).toBe(true);
    });

    it('STRICTLY DOES NOT match goal markets when Over Córners is selected (Prevents Bug)', () => {
      expect(matchesMarketFilter('Over Córners', 'Over 2.5 Goles', 'Más de 2.5')).toBe(false);
      expect(matchesMarketFilter('Over Córners', 'Over 1.5 Goles', 'Más de 1.5')).toBe(false);
      expect(matchesMarketFilter('Over Córners', 'Total Goles', 'Over 2.5')).toBe(false);
      expect(matchesMarketFilter('Over Córners', 'Ambos Equipos Anotan', 'Sí')).toBe(false);
      expect(matchesMarketFilter('Over Córners', 'Ganador Local', '1')).toBe(false);
      expect(matchesMarketFilter('Over Córners', 'Ganador Visitante', '2')).toBe(false);
      expect(matchesMarketFilter('Córners', 'Over 2.5 Goles', 'Más de 2.5')).toBe(false);
    });

    it('rejects Under corners when filtering for Over Córners', () => {
      expect(matchesMarketFilter('Over Córners', 'Córners', 'Under 9.5 Dórners')).toBe(false);
      expect(matchesMarketFilter('Over Córners', 'Córners', 'Menos de 9.5')).toBe(false);
    });
  });

  describe('Goal market filtering isolation', () => {
    it('matches goal signals with Over 2.5 Goles filter', () => {
      expect(matchesMarketFilter('Over 2.5 Goles', 'Over 2.5 Goles', 'Más de 2.5')).toBe(true);
      expect(matchesMarketFilter('Over 2.5 Goles', 'Total Goles', 'Over 2.5 Goles')).toBe(true);
      expect(matchesMarketFilter('Over 2.5 Goles', 'Goles', 'Over 2.5')).toBe(true);
    });

    it('STRICTLY DOES NOT match corner signals with Over 2.5 Goles filter', () => {
      expect(matchesMarketFilter('Over 2.5 Goles', 'Over Córners', 'Más de 9.5')).toBe(false);
      expect(matchesMarketFilter('Over 2.5 Goles', 'Córners', 'Over 9.5 Corners')).toBe(false);
      expect(matchesMarketFilter('Over 2.5 Goles', 'Total Córners', 'Over 10.5')).toBe(false);
    });
  });

  describe('BTTS (Ambos Equipos Anotan)', () => {
    it('matches BTTS signals', () => {
      expect(matchesMarketFilter('Ambos Equipos Anotan', 'Ambos Equipos Anotan', 'Sí')).toBe(true);
      expect(matchesMarketFilter('Ambos Equipos Anotan', 'BTTS', 'Yes')).toBe(true);
    });

    it('does not match corner or goal picks', () => {
      expect(matchesMarketFilter('Ambos Equipos Anotan', 'Over Córners', 'Más de 9.5')).toBe(false);
      expect(matchesMarketFilter('Ambos Equipos Anotan', 'Over 2.5 Goles', 'Más de 2.5')).toBe(false);
    });
  });

  describe('1X2 Match Winner', () => {
    it('matches Home win accurately', () => {
      expect(matchesMarketFilter('Ganador Local', 'Ganador Local', '1')).toBe(true);
      expect(matchesMarketFilter('Ganador Local', 'Ganador del Partido', '1')).toBe(true);
      expect(matchesMarketFilter('Ganador Local', 'Ganador Visitante', '2')).toBe(false);
      expect(matchesMarketFilter('Ganador Local', 'Over Córners', 'Más de 9.5')).toBe(false);
    });

    it('matches Away win accurately', () => {
      expect(matchesMarketFilter('Ganador Visitante', 'Ganador Visitante', '2')).toBe(true);
      expect(matchesMarketFilter('Ganador Visitante', 'Ganador del Partido', '2')).toBe(true);
      expect(matchesMarketFilter('Ganador Visitante', 'Ganador Local', '1')).toBe(false);
      expect(matchesMarketFilter('Ganador Visitante', 'Over Córners', 'Más de 9.5')).toBe(false);
    });
  });

  describe('American Sports Markets', () => {
    it('matches Puck Line and Moneyline', () => {
      expect(matchesMarketFilter('Puck Line', 'Puck Line (-1.5)', 'Hurricanes -1.5')).toBe(true);
      expect(matchesMarketFilter('Moneyline', 'Moneyline', 'Rangers')).toBe(true);
      expect(matchesMarketFilter('Total Points', 'Total Points', 'Over 220.5')).toBe(true);
    });
  });

  describe('Wildcard ALL filter', () => {
    it('always returns true for all or ALL', () => {
      expect(matchesMarketFilter('all', 'Over Córners', 'Más de 9.5')).toBe(true);
      expect(matchesMarketFilter('ALL', 'Over 2.5 Goles', 'Más de 2.5')).toBe(true);
      expect(matchesMarketFilter('', 'Over Córners', 'Más de 9.5')).toBe(true);
    });
  });
});
