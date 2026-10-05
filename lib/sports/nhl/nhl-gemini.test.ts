import { describe, it, expect } from 'vitest';
import { auditNHLPredictionsWithGeminiVeto, auditPredictionsWithGeminiVeto } from '../../ai/claude-analyst';
import { NHLSyncEngine } from './nhl-sync';
import { MarketOpportunity } from '../prediction-engine';

describe('NHL Gemini AI Integration Suite', () => {
  const sampleNHLOpportunities: MarketOpportunity[] = [
    {
      id: 'nhl_gemini_test_01',
      fixtureId: 'nhl_game_101',
      match: 'Edmonton Oilers vs Calgary Flames',
      homeTeam: 'Edmonton Oilers',
      awayTeam: 'Calgary Flames',
      league: 'NHL',
      country: 'NHL',
      kickoff: '2026-10-08T22:00:00Z',
      market: 'TOTAL GOALS',
      selection: 'Over 6.0 Goles',
      odds: 1.88,
      fairOdds: 1.65,
      probability: 61,
      edge: 7,
      expectedValue: 8,
      confidence: 'Alta',
      smartScore: 82,
      explanation: 'El modelo proyecta xG de 3.65 vs 2.95 con ventaja ofensiva en Power Play.',
      sport: 'nhl',
      status: 'pending',
    },
    {
      id: 'nhl_gemini_test_02',
      fixtureId: 'nhl_game_102',
      match: 'Toronto Maple Leafs vs Boston Bruins',
      homeTeam: 'Toronto Maple Leafs',
      awayTeam: 'Boston Bruins',
      league: 'NHL',
      country: 'NHL',
      kickoff: '2026-10-08T23:00:00Z',
      market: 'MONEYLINE',
      selection: 'Toronto Maple Leafs (Ganador incl. Prórroga)',
      odds: 1.72,
      fairOdds: 1.58,
      probability: 63,
      edge: 6,
      expectedValue: 7,
      confidence: 'Alta',
      smartScore: 84,
      explanation: 'Superioridad en posesión 5v5 (Corsi 54%) y portero titular confirmado.',
      sport: 'nhl',
      status: 'pending',
    },
    {
      id: 'nhl_gemini_test_03',
      fixtureId: 'nhl_game_103',
      match: 'Colorado Avalanche vs Vegas Golden Knights',
      homeTeam: 'Colorado Avalanche',
      awayTeam: 'Vegas Golden Knights',
      league: 'NHL',
      country: 'NHL',
      kickoff: '2026-10-09T01:00:00Z',
      market: 'PUCK LINE',
      selection: 'Colorado Avalanche -1.5',
      odds: 2.55,
      fairOdds: 2.30,
      probability: 44,
      edge: 1,
      expectedValue: 0,
      confidence: 'Media',
      smartScore: 65,
      explanation: 'Puck line de alta cuota con ventaja proyectada.',
      sport: 'nhl',
      status: 'pending',
    },
  ];

  it('executes auditNHLPredictionsWithGeminiVeto and returns hockey tactical analysis', async () => {
    const result = await auditNHLPredictionsWithGeminiVeto(sampleNHLOpportunities);

    expect(result).toBeDefined();
    expect(result.audits.length).toBe(3);
    expect(result.approvedPicks.length).toBeGreaterThan(0);

    // Verify audits have risk score and tactical hockey evaluation
    for (const audit of result.audits) {
      expect(typeof audit.riskScore).toBe('number');
      expect(audit.riskScore).toBeGreaterThanOrEqual(0);
      expect(audit.riskScore).toBeLessThanOrEqual(100);
      expect(typeof audit.vetoed).toBe('boolean');
    }

    console.log('Gemini NHL Audit Result:', {
      usedAi: result.usedAi,
      provider: result.provider,
      approvedCount: result.approvedPicks.length,
      vetoedCount: result.vetoedPicks.length,
      sampleNote: result.audits[0]?.tacticalNote,
    });
  }, 45000);

  it('routes auditPredictionsWithGeminiVeto to NHL auditor when sport is nhl', async () => {
    const result = await auditPredictionsWithGeminiVeto(sampleNHLOpportunities, 'nhl');

    expect(result).toBeDefined();
    expect(result.audits.length).toBe(3);
  }, 45000);

  it('NHLSyncEngine generates today NHL signals and applies Gemini AI audit', async () => {
    const syncResult = await NHLSyncEngine.getTodayNHLSignals(undefined, true);

    expect(syncResult).toBeDefined();
    expect(Array.isArray(syncResult.signals)).toBe(true);

    if (syncResult.signals.length > 0) {
      // Check that signals contain AI audit annotations
      const firstSignal = syncResult.signals[0];
      expect(firstSignal.explanation).toBeDefined();

      if (syncResult.smartPick) {
        expect(syncResult.smartPick.isSmartPick).toBe(true);
        expect((syncResult.smartPick as any).aiVetoed).not.toBe(true);
      }
    }
  }, 60000);
});
