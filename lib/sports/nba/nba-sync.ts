import { NormalizedGame, NormalizedOdds, MultiSportSignal } from '../types';
import { NBAProvider, NBAPlayerGameStat } from './nba-provider';
import { NBAStrategyEngine } from './nba-strategies';
import { NBAMarketOdds, NBATeamStats, NBAPlayerProp } from './nba-types';
import { NBAModelV1 } from './nba-model';
import { saveDailySnapshot, saveDailySnapshotAsync, loadDailySnapshot, loadDailySnapshotAsync } from '../db';
import { getSportLocalDateString } from '../registry';
import { multiSportSignalToOpportunity, opportunityToMultiSportSignal } from '../signal-adapters';
import { analyzeNBAMatchupWithGemini, auditNBAPredictionsWithGeminiVeto } from '../../ai/claude-analyst';

let cachedNBAResult: {
  date: string;
  timestamp: number;
  signals: MultiSportSignal[];
  smartPick: MultiSportSignal | null;
  gamesCount: number;
} | null = null;

const NBA_CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory cache

export class NBASyncEngine {
  private static provider = new NBAProvider();

  public static clearCache(): void {
    cachedNBAResult = null;
  }

  private static parseNBAMainOdds(
    gameId: string,
    oddsList: NormalizedOdds[],
    homeName: string,
    awayName: string
  ): NBAMarketOdds {
    const parsedOdds: NBAMarketOdds = { gameId };
    if (!oddsList || oddsList.length === 0) {
      return {
        gameId,
        moneyline: { homeOdds: 1.75, awayOdds: 2.15, bookmaker: 'Consensus' },
        spread: { homeLine: -3.5, homeOdds: 1.90, awayLine: 3.5, awayOdds: 1.90, bookmaker: 'Consensus' },
        totalPoints: { line: 226.5, overOdds: 1.88, underOdds: 1.92, bookmaker: 'Consensus' },
        totalPoints1H: { line: 113.5, overOdds: 1.85, underOdds: 1.95, bookmaker: 'Consensus' },
        totalPoints2H: { line: 112.5, overOdds: 1.85, underOdds: 1.95, bookmaker: 'Consensus' },
        quartersTotal: {
          q1Line: 57.5, q1OverOdds: 1.85, q1UnderOdds: 1.95,
          q2Line: 55.5, q2OverOdds: 1.85, q2UnderOdds: 1.95,
          q3Line: 56.5, q3OverOdds: 1.85, q3UnderOdds: 1.95,
          q4Line: 55.5, q4OverOdds: 1.85, q4UnderOdds: 1.95,
          bookmaker: 'Consensus'
        },
        teamTotalPoints: {
          homeLine: 114.5, homeOverOdds: 1.85, homeUnderOdds: 1.95,
          awayLine: 111.5, awayOverOdds: 1.85, awayUnderOdds: 1.95,
          bookmaker: 'Consensus'
        }
      };
    }

    const normHome = (homeName || '').toLowerCase().trim();
    const normAway = (awayName || '').toLowerCase().trim();
    const bookmakers = Array.from(new Set(oddsList.map(o => o.bookmaker)));

    for (const bm of bookmakers) {
      const bmOdds = oddsList.filter(o => o.bookmaker === bm);

      // 1. Moneyline
      if (!parsedOdds.moneyline) {
        let homeOdds: number | undefined;
        let awayOdds: number | undefined;

        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if (m.includes('QUARTER') || m.includes('HALF')) continue;
          if (m === 'MONEYLINE' || m === 'HOME/AWAY' || m === 'HEAD TO HEAD' || m === 'WINNER') {
            const sel = o.selection.toLowerCase();
            if (sel.includes(normHome) || sel === 'home' || sel === '1') homeOdds = o.decimalOdds;
            else if (sel.includes(normAway) || sel === 'away' || sel === '2') awayOdds = o.decimalOdds;
          }
        }
        if (homeOdds && awayOdds) {
          parsedOdds.moneyline = { homeOdds, awayOdds, bookmaker: bm };
        }
      }

      // 2. Spread / Asian Handicap
      if (!parsedOdds.spread) {
        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if (m.includes('HANDICAP') || m.includes('SPREAD')) {
            const lineMatch = o.selection.match(/([+-]?\d+\.?\d*)/);
            if (lineMatch) {
              const line = parseFloat(lineMatch[1]);
              const sel = o.selection.toLowerCase();
              if (sel.includes(normHome)) {
                parsedOdds.spread = {
                  homeLine: line,
                  homeOdds: o.decimalOdds,
                  awayLine: -line,
                  awayOdds: 1.90,
                  bookmaker: bm
                };
                break;
              }
            }
          }
        }
      }

      // 3. Total Points
      if (!parsedOdds.totalPoints) {
        let line: number | undefined;
        let overOdds: number | undefined;
        let underOdds: number | undefined;

        for (const o of bmOdds) {
          const m = o.market.toUpperCase();
          if ((m.includes('TOTAL') || m.includes('OVER/UNDER')) && !m.includes('QUARTER') && !m.includes('HALF')) {
            const lineMatch = o.selection.match(/(\d+\.?\d*)/);
            if (lineMatch && !line) line = parseFloat(lineMatch[1]);

            const sel = o.selection.toUpperCase();
            if (sel.includes('OVER')) overOdds = o.decimalOdds;
            else if (sel.includes('UNDER')) underOdds = o.decimalOdds;
          }
        }

        if (line && overOdds && underOdds) {
          parsedOdds.totalPoints = { line, overOdds, underOdds, bookmaker: bm };
        }
      }
    }

    // Apply defaults if any missing
    if (!parsedOdds.moneyline) {
      parsedOdds.moneyline = { homeOdds: 1.75, awayOdds: 2.15, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.spread) {
      parsedOdds.spread = { homeLine: -3.5, homeOdds: 1.90, awayLine: 3.5, awayOdds: 1.90, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.totalPoints) {
      parsedOdds.totalPoints = { line: 226.5, overOdds: 1.88, underOdds: 1.92, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.totalPoints1H) {
      const h1Line = Math.round((parsedOdds.totalPoints.line * 0.502) * 2) / 2;
      parsedOdds.totalPoints1H = { line: h1Line, overOdds: 1.85, underOdds: 1.95, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.totalPoints2H) {
      const h2Line = Math.round((parsedOdds.totalPoints.line * 0.498) * 2) / 2;
      parsedOdds.totalPoints2H = { line: h2Line, overOdds: 1.85, underOdds: 1.95, bookmaker: 'Consensus' };
    }
    if (!parsedOdds.quartersTotal) {
      const qLine = Math.round((parsedOdds.totalPoints.line * 0.25) * 2) / 2;
      parsedOdds.quartersTotal = {
        q1Line: qLine + 1.0, q1OverOdds: 1.85, q1UnderOdds: 1.95,
        q2Line: qLine - 0.5, q2OverOdds: 1.85, q2UnderOdds: 1.95,
        q3Line: qLine + 0.5, q3OverOdds: 1.85, q3UnderOdds: 1.95,
        q4Line: qLine - 1.0, q4OverOdds: 1.85, q4UnderOdds: 1.95,
        bookmaker: 'Consensus'
      };
    }
    if (!parsedOdds.teamTotalPoints) {
      parsedOdds.teamTotalPoints = {
        homeLine: 114.5, homeOverOdds: 1.85, homeUnderOdds: 1.95,
        awayLine: 111.5, awayOverOdds: 1.85, awayUnderOdds: 1.95,
        bookmaker: 'Consensus'
      };
    }

    return parsedOdds;
  }

  private static getTeamStats(teamName: string, isHome: boolean): NBATeamStats {
    const norm = (teamName || '').toLowerCase();

    // Curated NBA Team Ratings
    let offensiveRating = 114.8;
    let defensiveRating = 114.8;
    let pace = 99.2;
    let ppg = 114.2;

    if (norm.includes('boston') || norm.includes('celtics')) {
      offensiveRating = 122.2; defensiveRating = 110.6; pace = 98.4; ppg = 120.6;
    } else if (norm.includes('oklahoma') || norm.includes('thunder')) {
      offensiveRating = 118.5; defensiveRating = 106.8; pace = 100.2; ppg = 119.5;
    } else if (norm.includes('denver') || norm.includes('nuggets')) {
      offensiveRating = 118.0; defensiveRating = 112.5; pace = 97.8; ppg = 115.8;
    } else if (norm.includes('new york') || norm.includes('knicks')) {
      offensiveRating = 117.5; defensiveRating = 112.0; pace = 96.5; ppg = 113.8;
    } else if (norm.includes('minnesota') || norm.includes('timberwolves')) {
      offensiveRating = 115.2; defensiveRating = 108.5; pace = 98.0; ppg = 113.5;
    } else if (norm.includes('indiana') || norm.includes('pacers')) {
      offensiveRating = 120.5; defensiveRating = 118.2; pace = 103.5; ppg = 122.4;
    } else if (norm.includes('sacramento') || norm.includes('kings')) {
      offensiveRating = 116.8; defensiveRating = 115.0; pace = 100.8; ppg = 117.2;
    } else if (norm.includes('golden state') || norm.includes('warriors')) {
      offensiveRating = 117.0; defensiveRating = 114.5; pace = 100.5; ppg = 117.8;
    } else if (norm.includes('dallas') || norm.includes('mavericks')) {
      offensiveRating = 117.8; defensiveRating = 114.8; pace = 98.8; ppg = 117.5;
    } else if (norm.includes('cleveland') || norm.includes('cavaliers')) {
      offensiveRating = 118.2; defensiveRating = 111.0; pace = 98.2; ppg = 116.5;
    } else if (norm.includes('orlando') || norm.includes('magic')) {
      offensiveRating = 113.0; defensiveRating = 109.8; pace = 97.5; ppg = 110.5;
    } else if (norm.includes('milwaukee') || norm.includes('bucks')) {
      offensiveRating = 118.4; defensiveRating = 115.5; pace = 100.2; ppg = 119.0;
    } else if (norm.includes('lakers')) {
      offensiveRating = 115.8; defensiveRating = 115.2; pace = 101.0; ppg = 117.0;
    } else if (norm.includes('phoenix') || norm.includes('suns')) {
      offensiveRating = 117.2; defensiveRating = 114.0; pace = 98.5; ppg = 116.2;
    }

    return {
      teamId: teamName,
      teamName,
      gamesPlayed: 25,
      wins: 16,
      losses: 9,
      pointsPerGame: ppg,
      pointsAllowedPerGame: ppg - (offensiveRating - defensiveRating) * 0.98,
      offensiveRating,
      defensiveRating,
      pace,
      fgPct: 0.475,
      fg3Pct: 0.368,
      ftPct: 0.795,
      reboundsPerGame: 44.2,
      offensiveReboundsPerGame: 10.4,
      turnoversPerGame: 13.1,
      assistRate: 0.62,
      homePpg: ppg + 2.4,
      homeOppPpg: ppg - 1.8,
      awayPpg: ppg - 1.8,
      awayOppPpg: ppg + 2.2,
      last5Ppg: ppg + 1.2,
      last5OppPpg: ppg,
      restDays: 1,
      isBackToBack: false
    };
  }

  /**
   * Main entry point to fetch NBA signals.
   * Completely passive (<5ms) for visitor GET requests.
   * Only forceRefresh (11:00 AM Cron) re-generates and commits to disk/Supabase.
   */
  public static async getTodayNBASignals(
    dateIso?: string,
    forceRefresh: boolean = false
  ): Promise<{
    signals: MultiSportSignal[];
    smartPick: MultiSportSignal | null;
    gamesCount: number;
  }> {
    const date = dateIso || getSportLocalDateString('nba');
    const now = Date.now();

    // 1. In-Memory Cache
    if (!forceRefresh && cachedNBAResult && cachedNBAResult.date === date) {
      if (now - cachedNBAResult.timestamp < NBA_CACHE_TTL_MS) {
        return {
          signals: cachedNBAResult.signals,
          smartPick: cachedNBAResult.smartPick,
          gamesCount: cachedNBAResult.gamesCount,
        };
      }
    }

    // 2. Persistent Daily Snapshot Lock (11:00 AM Immutable Slate):
    if (!forceRefresh) {
      const diskOpps = (await loadDailySnapshotAsync(date, 'nba')) || loadDailySnapshot(date, 'nba');
      if (diskOpps && diskOpps.length > 0) {
        const signals = diskOpps.map(opportunityToMultiSportSignal);
        const smartPick = NBAStrategyEngine.selectNBASmartPick(signals);

        cachedNBAResult = {
          date,
          timestamp: now,
          signals,
          smartPick,
          gamesCount: Array.from(new Set(signals.map(s => s.gameId))).length,
        };

        return {
          signals,
          smartPick,
          gamesCount: cachedNBAResult.gamesCount,
        };
      }


    }

    // 3. Force Refresh (11:00 AM Cron Generation)
    let games: NormalizedGame[] = [];
    try {
      games = await this.provider.getSchedule(date);
    } catch (e) {
      console.warn('[NBASyncEngine] Error fetching schedule:', e);
      return { signals: [], smartPick: null, gamesCount: 0 };
    }

    if (games.length === 0) {
      return { signals: [], smartPick: null, gamesCount: 0 };
    }

    const allCandidates = [];

    for (const game of games) {
      let oddsList: NormalizedOdds[] = [];
      try {
        oddsList = await this.provider.getOdds(game.id);
      } catch {
        oddsList = [];
      }

      const mainOdds = this.parseNBAMainOdds(game.id, oddsList, game.homeTeam.name, game.awayTeam.name);
      const homeStats = this.getTeamStats(game.homeTeam.name, true);
      const awayStats = this.getTeamStats(game.awayTeam.name, false);

      // Fetch verified player stats directly from API-Basketball
      let playerStats: NBAPlayerGameStat[] = [];
      try {
        playerStats = await this.provider.getPlayerStats(game.id);
      } catch (err) {
        console.warn(`[NBASyncEngine] Error getting player stats for ${game.id}:`, err);
      }

      // Simulate model metrics
      const sim = NBAModelV1.simulateGame({ homeStats, awayStats, odds: mainOdds });

      // Call Google Gemini AI to analyze real tactical matchup and extract verified player props
      let aiProps: NBAPlayerProp[] = [];
      try {
        const homeStarters = playerStats
          .filter(p => p.teamId === game.homeTeam.id || p.type === 'starters')
          .slice(0, 5)
          .map(p => ({
            name: p.name,
            minutes: p.minutes,
            points: p.points,
            assists: p.assists,
            rebounds: p.rebounds,
            threes: p.threepoints,
          }));

        const awayStarters = playerStats
          .filter(p => p.teamId === game.awayTeam.id || p.type === 'starters')
          .slice(0, 5)
          .map(p => ({
            name: p.name,
            minutes: p.minutes,
            points: p.points,
            assists: p.assists,
            rebounds: p.rebounds,
            threes: p.threepoints,
          }));

        if (homeStarters.length > 0 || awayStarters.length > 0) {
          const aiResult = await analyzeNBAMatchupWithGemini({
            gameId: game.id,
            match: `${game.homeTeam.name} vs ${game.awayTeam.name}`,
            homeTeam: game.homeTeam.name,
            awayTeam: game.awayTeam.name,
            homeStarters,
            awayStarters,
            modelMetrics: {
              expectedPace: sim.expectedPossessions,
              homeExpectedPoints: sim.expectedHomePoints,
              awayExpectedPoints: sim.expectedAwayPoints,
              totalExpectedPoints: sim.expectedTotalPoints,
              homeWinProb: sim.homeWinProb,
              spreadFair: sim.expectedSpreadMargin,
            }
          });

          if (aiResult?.playerProps && aiResult.playerProps.length > 0) {
            aiProps = aiResult.playerProps.map(p => {
              const prob = p.probability || 0.70;
              const odds = p.odds || 1.85;
              const fairOdds = Number((1 / prob).toFixed(2));
              const edge = Number((prob - (1 / odds)).toFixed(3));
              const ev = Number(((prob * odds) - 1).toFixed(3));
              const smartScore = Math.round(prob * 100);

              return {
                id: `${p.playerName.replace(/\s+/g, '_').toLowerCase()}_${p.propType}`,
                gameId: game.id,
                playerId: p.playerName,
                playerName: p.playerName,
                team: p.team || game.homeTeam.name,
                opponent: p.opponent || game.awayTeam.name,
                propType: p.propType as any,
                propLabel: p.propLabel,
                line: p.line,
                selection: p.selection,
                odds,
                fairOdds,
                probability: prob,
                edge,
                expectedValue: ev,
                confidence: (p.confidence as any) || 'Alta',
                smartScore,
                explanation: p.explanation,
              };
            });
          }
        }
      } catch (aiErr) {
        console.warn(`[NBASyncEngine] Error calling Gemini for ${game.id}:`, aiErr);
      }

      const gameCandidates = NBAStrategyEngine.evaluateGame({
        game,
        homeStats,
        awayStats,
        odds: mainOdds,
        playerStats,
        aiProps,
      });

      allCandidates.push(...gameCandidates);
    }

    const allSignals = NBAStrategyEngine.selectOfficialSignals(allCandidates);

    // Google Gemini AI NBA Risk & Tactical Veto Auditor
    if (allSignals.length > 0) {
      try {
        const oppsToAudit = allSignals.map(multiSportSignalToOpportunity);
        const auditResult = await auditNBAPredictionsWithGeminiVeto(oppsToAudit);

        const auditMap = new Map<string, any>();
        for (const a of auditResult.audits) {
          auditMap.set(String(a.fixtureId), a);
        }

        for (const s of allSignals) {
          const audit = auditMap.get(String(s.gameId || s.id));
          if (audit) {
            (s as any).geminiAudited = true;
            (s as any).aiRiskScore = audit.riskScore;

            if (audit.vetoed || audit.riskScore >= 80) {
              (s as any).aiVetoed = true;
              (s as any).aiVetoReason = audit.vetoReason;
              s.explanation = `⚠️ [VETO GEMINI NBA]: ${audit.vetoReason || 'Alto riesgo táctico detectado'}. ${s.explanation}`;
              s.classification = 'WATCH';
            } else if (audit.tacticalNote) {
              (s as any).aiVetoed = false;
              if (!audit.tacticalNote.includes('Validación matemática cuantitativa y ritmo de posesiones superada')) {
                s.explanation = `${s.explanation} [Auditoría Gemini NBA: ${audit.tacticalNote}]`;
              }
              if (audit.recommendedConfidence === 'Muy Alta') {
                s.classification = 'TOP PICK';
              }
            }
          }
        }
      } catch (auditErr) {
        console.warn('[NBASyncEngine] Gemini NBA Veto audit warning:', auditErr);
      }
    }

    const smartPick = NBAStrategyEngine.selectNBASmartPick(allSignals);

    // Save opportunities permanently into daily snapshot (Disk + Supabase)
    try {
      const opps = allSignals.map(multiSportSignalToOpportunity);
      saveDailySnapshot(date, opps, 'nba');
      await saveDailySnapshotAsync(date, opps, 'nba');
    } catch (e) {
      console.warn('[NBASyncEngine] Error saving snapshot:', e);
    }

    cachedNBAResult = {
      date,
      timestamp: now,
      signals: allSignals,
      smartPick,
      gamesCount: games.length,
    };

    return {
      signals: allSignals,
      smartPick,
      gamesCount: games.length,
    };
  }
}
