import { describe, it, expect } from 'vitest';
import { evaluateMarketResult } from './db';

describe('evaluateMarketResult', () => {
  describe('1. Ganador Local (1)', () => {
    it('wins when home goals are strictly greater than away goals', () => {
      const res = evaluateMarketResult('Ganador Local', 4, 0);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('4 - 0');
    });

    it('wins with Gana Local market naming', () => {
      const res = evaluateMarketResult('Gana Local', 2, 1);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('2 - 1');
    });

    it('loses when match ends in a draw', () => {
      const res = evaluateMarketResult('Ganador Local', 1, 1);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('1 - 1');
    });

    it('loses when away team wins', () => {
      const res = evaluateMarketResult('Ganador Local', 0, 2);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('0 - 2');
    });
  });

  describe('2. Ganador Visitante (2)', () => {
    it('wins when away goals are strictly greater than home goals', () => {
      const res = evaluateMarketResult('Ganador Visitante', 1, 3);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('1 - 3');
    });

    it('wins when away goals are strictly greater than home goals (Gana Visitante)', () => {
      const res = evaluateMarketResult('Gana Visitante', 0, 4);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('0 - 4');
    });

    it('loses when match ends in a draw', () => {
      const res = evaluateMarketResult('Ganador Visitante', 0, 0);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('0 - 0');
    });

    it('loses when home team wins', () => {
      const res = evaluateMarketResult('Ganador Visitante', 2, 0);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('2 - 0');
    });
  });

  describe('3. Empate (X)', () => {
    it('wins when match ends in a goalless draw (0 - 0)', () => {
      const res = evaluateMarketResult('Empate (X)', 0, 0);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('0 - 0');
    });

    it('wins when match ends in a score draw (2 - 2)', () => {
      const res = evaluateMarketResult('Empate (X)', 2, 2);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('2 - 2');
    });

    it('loses when home team wins (1 - 0)', () => {
      const res = evaluateMarketResult('Empate (X)', 1, 0);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('1 - 0');
    });
  });

  describe('4. Over 2.5 Goles', () => {
    it('wins when total goals is 3 or more', () => {
      const res = evaluateMarketResult('Over 2.5 Goles', 2, 1);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('2 - 1 (3 Goles)');
    });

    it('loses when total goals is 2 or less', () => {
      const res = evaluateMarketResult('Over 2.5 Goles', 1, 1);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('1 - 1 (2 Goles)');
    });
  });

  describe('5. Under 2.5 Goles', () => {
    it('wins when total goals is 2 or less', () => {
      const res = evaluateMarketResult('Under 2.5 Goles', 1, 0);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('1 - 0 (1 Goles)');
    });

    it('loses when total goals is 3 or more', () => {
      const res = evaluateMarketResult('Under 2.5 Goles', 2, 2);
      expect(res.isWon).toBe(false);
      expect(res.actualScoreText).toBe('2 - 2 (4 Goles)');
    });
  });

  describe('6. Ambos Equipos Anotan / BTTS', () => {
    it('wins when both teams score at least 1 goal with Ambos Equipos Anotan', () => {
      const res = evaluateMarketResult('Ambos Equipos Anotan', 3, 4);
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('3 - 4 (Ambos Sí)');
    });

    it('loses when one or both teams score 0 goals with Ambos Equipos Anotan', () => {
      const res1 = evaluateMarketResult('Ambos Equipos Anotan', 4, 0);
      expect(res1.isWon).toBe(false);
      expect(res1.actualScoreText).toBe('4 - 0 (No)');

      const res2 = evaluateMarketResult('Ambos Equipos Anotan', 0, 0);
      expect(res2.isWon).toBe(false);
      expect(res2.actualScoreText).toBe('0 - 0 (No)');
    });
  });

  describe('7. Mercados de Córners (Over / Under 6.5, 7.5, 8.5, 9.5, 10.5)', () => {
    it('correctly evaluates Over 6.5 Córners', () => {
      const resWon = evaluateMarketResult('Córners', 1, 0, { selection: 'Over 6.5', homeCorners: 4, awayCorners: 3 });
      expect(resWon.isWon).toBe(true);
      expect(resWon.actualScoreText).toBe('4 - 3 (7 Córners)');

      const resLost = evaluateMarketResult('Córners', 1, 0, { selection: 'Over 6.5', homeCorners: 3, awayCorners: 3 });
      expect(resLost.isWon).toBe(false);
      expect(resLost.actualScoreText).toBe('3 - 3 (6 Córners)');
    });

    it('correctly evaluates Over 7.5 Córners (e.g. Granad. Tenerife W vs Sevilla W)', () => {
      const resWon = evaluateMarketResult('Córners', 0, 0, { selection: 'Over 7.5', homeCorners: 5, awayCorners: 3 });
      expect(resWon.isWon).toBe(true);
      expect(resWon.actualScoreText).toBe('5 - 3 (8 Córners)');

      const resLost = evaluateMarketResult('Córners', 0, 0, { selection: 'Over 7.5', homeCorners: 4, awayCorners: 3 });
      expect(resLost.isWon).toBe(false);
      expect(resLost.actualScoreText).toBe('4 - 3 (7 Córners)');
    });

    it('extracts line dynamically from pick text when selection is not provided', () => {
      const res = evaluateMarketResult('Córners', 0, 0, { pick: 'Over 7.5 Córners', homeCorners: 6, awayCorners: 4 });
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('6 - 4 (10 Córners)');
    });

    it('correctly evaluates Over bet when actualScore contains score hyphen without treating as Under', () => {
      const res = evaluateMarketResult('Córners', 1, 2, { pick: 'Over 7.5 Córners', actualScore: '6 - 4 (10 Córners)' });
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('6 - 4 (10 Córners)');
    });

    it('correctly evaluates Under 8.5 Córners', () => {
      const resWon = evaluateMarketResult('Córners', 1, 1, { selection: 'Under 8.5', homeCorners: 4, awayCorners: 4 });
      expect(resWon.isWon).toBe(true);
      expect(resWon.actualScoreText).toBe('4 - 4 (8 Córners)');

      const resLost = evaluateMarketResult('Córners', 1, 1, { selection: 'Under 8.5', homeCorners: 5, awayCorners: 4 });
      expect(resLost.isWon).toBe(false);
      expect(resLost.actualScoreText).toBe('5 - 4 (9 Córners)');
    });

    it('derives corner simulation correctly from cornerAnalysis expectedTotalCorners', () => {
      const res = evaluateMarketResult('Córners', 2, 1, {
        pick: 'Over 6.5 Córners',
        cornerAnalysis: {
          recommendedLine: 6.5,
          expectedTotalCorners: 10.2,
          expectedHomeCorners: 5.7,
          expectedAwayCorners: 4.5,
        },
      });
      expect(res.isWon).toBe(true);
      expect(res.actualScoreText).toBe('6 - 4 (10 Córners)');
    });
  });
});
