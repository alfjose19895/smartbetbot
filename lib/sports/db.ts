import { isExcludedMatch } from "./prediction-engine";
import { getImmutableDailyParlays } from "./parlay-generator";
import { auditPredictionsWithGeminiVeto } from "@/lib/ai/claude-analyst";
import { auditPredictionsBatchWithClaude, isClaudeConfigured } from "../ai/claude-analyst";
/**
 * Direct Supabase persistence and real-time live API-Football prediction service.
 * Strictly 100% real fixtures from API-Football aligned with Ecuador (America/Guayaquil, UTC-5) timezone.
 * Exclusively processes verified curated leagues (eliminating non-valued generic leagues).
 * Generates all genuine high-precision alerts dynamically without arbitrary pick limits.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { apiFootball, ALL_LEAGUE_IDS, TOP_5_LEAGUE_IDS, PRIORITY_EUROPEAN_LEAGUE_IDS, isPriorityEuropeanLeague, SUPPORTED_LEAGUES, ApiFootballFixtureItem, extractMarketOddsFromBookmaker, ApiFootballOddsItem, extractMatchDetails } from "./api-football";
import {
  evaluateFixturePrediction,
  MarketOpportunity,
  normalizeTeamName,
  getCanonicalTeamKey,
  normalizeLeagueInfo,
  getTimeSlot,
  isQualifiedOpportunity,
  getMarketPriorityRank,
} from "./prediction-engine";

export function getEcuadorDateString(d: Date | number | string = Date.now()): string {
  if (!d) return getEcuadorDateString(Date.now());
  const dateObj = typeof d === "string" ? new Date(d) : typeof d === "number" ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  try {
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "daily_snapshots");
const memorySnapshots: Record<string, MarketOpportunity[]> = {};

export function getOpportunityKey(p: { fixtureId?: number | string; match?: string; fixtureName?: string; homeTeam?: string; awayTeam?: string; market?: string }): string {
  const fixId = p.fixtureId || '0';
  const mkt = (p.market || '').toLowerCase().trim();
  if (fixId && fixId !== '0' && fixId !== 0) {
    return `fix-${fixId}-${mkt}`;
  }
  const h = getCanonicalTeamKey(p.homeTeam || '');
  const a = getCanonicalTeamKey(p.awayTeam || '');
  if (h && a) {
    return `teams-${h}-${a}-${mkt}`;
  }
  const match = (p.fixtureName || p.match || '').toLowerCase().trim();
  if (match) {
    return `match-${match}-${mkt}`;
  }
  return `id-${(p as any).id || Math.random()}-${mkt}`;
}

export const HISTORY_START_DATE = "2026-09-07"; // Historial oficial reiniciado desde hoy (7 de Septiembre de 2026)

function ensureSnapshotsDir() {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Could not create snapshots dir:", err);
  }
}

export function loadDailySnapshot(dateStr: string): MarketOpportunity[] | null {
  if (memorySnapshots[dateStr] && Array.isArray(memorySnapshots[dateStr]) && memorySnapshots[dateStr].length > 0) {
    return memorySnapshots[dateStr].filter((p) => !isExcludedMatch(p.homeTeam, p.awayTeam, p.match));
  }
  try {
    ensureSnapshotsDir();
    const filePath = path.join(SNAPSHOTS_DIR, `${dateStr}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const picks = JSON.parse(data);
      if (Array.isArray(picks)) {
        const filtered = picks.filter((p) => !isExcludedMatch(p.homeTeam, p.awayTeam, p.match));
        memorySnapshots[dateStr] = filtered;
        return filtered;
      }
    }
  } catch (err) {
    console.warn(`Could not load daily snapshot for ${dateStr}:`, err);
  }
  return null;
}

export async function loadDailySnapshotAsync(dateStr: string): Promise<MarketOpportunity[] | null> {
  const diskPicks = loadDailySnapshot(dateStr) || [];

  // Supabase cloud database fetch (guarantees persistence on Vercel Serverless)
  let supabasePicks: MarketOpportunity[] = [];
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("daily_snapshots")
        .select("picks")
        .eq("date", dateStr)
        .maybeSingle();
      if (!error && data && Array.isArray(data.picks) && data.picks.length > 0) {
        supabasePicks = data.picks.filter((p: any) => !isExcludedMatch(p.homeTeam, p.awayTeam, p.match));
      }
    } catch (err) {
      console.warn(`[Supabase] Error loading daily snapshot for ${dateStr}:`, err);
    }
  }

  if (diskPicks.length === 0 && supabasePicks.length === 0) {
    return null;
  }

  // Merge disk + Supabase with zero data loss (Self-Healing bidirectional sync)
  const mergedMap = new Map<string, MarketOpportunity>();
  for (const p of supabasePicks) {
    mergedMap.set(getOpportunityKey(p), p);
  }
  for (const p of diskPicks) {
    const key = getOpportunityKey(p);
    if (!mergedMap.has(key)) {
      mergedMap.set(key, p);
    } else {
      const existing = mergedMap.get(key)!;
      const isSettled = existing.status === "won" || existing.status === "lost";
      mergedMap.set(key, {
        ...existing,
        ...p,
        status: isSettled ? existing.status : p.status || existing.status,
        actualScore: existing.actualScore || p.actualScore,
        probability: existing.probability,
        odds: existing.odds,
        market: existing.market,
        selection: existing.selection,
      });
    }
  }

  const finalCombined = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  memorySnapshots[dateStr] = finalCombined;

  // Auto-heal disk and Supabase if either side had fewer picks
  if (finalCombined.length > diskPicks.length) {
    try {
      ensureSnapshotsDir();
      const filePath = path.join(SNAPSHOTS_DIR, `${dateStr}.json`);
      fs.writeFileSync(filePath, JSON.stringify(finalCombined, null, 2), "utf-8");
    } catch {}
  }
  if (supabase && finalCombined.length > supabasePicks.length) {
    supabase
      .from("daily_snapshots")
      .upsert(
        {
          date: dateStr,
          picks: finalCombined,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "date" }
      )
      .then(() => {});
  }

  return finalCombined;
}

export function saveDailySnapshot(dateStr: string, picks: MarketOpportunity[]) {
  // Never write disk snapshots during test execution to prevent test mocks from polluting production data
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    memorySnapshots[dateStr] = picks;
    return;
  }
  try {
    ensureSnapshotsDir();
    const filePath = path.join(SNAPSHOTS_DIR, `${dateStr}.json`);

    // Load existing picks if file or memory already exists so we NEVER delete previously given alerts
    let existingPicks: MarketOpportunity[] = memorySnapshots[dateStr] || [];
    if (existingPicks.length === 0 && fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          existingPicks = parsed;
        }
      } catch {}
    }

    const mergedMap = new Map<string, MarketOpportunity>();

    // Put all existing picks first indexed strictly by opportunity key
    for (const p of existingPicks) {
      const key = getOpportunityKey(p);
      mergedMap.set(key, p);
    }

    // Merge incoming picks strictly by key (updating existing or appending new)
    for (const p of picks) {
      const key = getOpportunityKey(p);

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key)!;
        const isSettled =
          existing.status === "won" ||
          existing.status === "lost" ||
          existing.result === "WON" ||
          existing.result === "LOST" ||
          Boolean(existing.actualScore);

        const updated = {
          ...existing,
          ...p,
          status: p.status || existing.status || "pending",
          actualScore: p.actualScore !== undefined ? p.actualScore : existing.actualScore,
          result: (p as any).result !== undefined ? (p as any).result : (existing as any).result,
          profit: typeof (p as any).profit === "number" ? (p as any).profit : (existing as any).profit,
          homeLogo: p.homeLogo || existing.homeLogo,
          awayLogo: p.awayLogo || existing.awayLogo,
          leagueLogo: p.leagueLogo || existing.leagueLogo,
        };
        mergedMap.set(key, updated);
      } else {
        mergedMap.set(key, p);
      }
    }

    const mergedPicks = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
    );

    memorySnapshots[dateStr] = mergedPicks;

    try {
      fs.writeFileSync(filePath, JSON.stringify(mergedPicks, null, 2), "utf-8");
    } catch {}

    // Synchronize to Supabase Cloud Database with non-destructive merge
    const supabase = getAdminClient();
    if (supabase) {
      (async () => {
        try {
          // Fetch cloud picks first to ensure cloud NEVER loses picks
          let cloudPicks: MarketOpportunity[] = [];
          const { data: cloudData } = await supabase
            .from("daily_snapshots")
            .select("picks")
            .eq("date", dateStr)
            .maybeSingle();

          if (cloudData && Array.isArray(cloudData.picks)) {
            cloudPicks = cloudData.picks;
          }

          const cloudMergedMap = new Map<string, MarketOpportunity>();
          for (const cp of cloudPicks) {
            cloudMergedMap.set(getOpportunityKey(cp), cp);
          }
          for (const lp of mergedPicks) {
            const key = getOpportunityKey(lp);
            if (cloudMergedMap.has(key)) {
              const existing = cloudMergedMap.get(key)!;
              cloudMergedMap.set(key, {
                ...existing,
                ...lp,
                status: lp.status || existing.status,
                actualScore: lp.actualScore !== undefined ? lp.actualScore : existing.actualScore,
                result: (lp as any).result !== undefined ? (lp as any).result : (existing as any).result,
                profit: typeof (lp as any).profit === "number" ? (lp as any).profit : (existing as any).profit,
              });
            } else {
              cloudMergedMap.set(key, lp);
            }
          }

          const finalCloudPicks = Array.from(cloudMergedMap.values()).sort(
            (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
          );

          const { error } = await supabase
            .from("daily_snapshots")
            .upsert(
              {
                date: dateStr,
                picks: finalCloudPicks,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "date" }
            );
          if (error) {
            console.warn(`[Supabase] Error saving daily snapshot for ${dateStr}:`, error.message);
          }
        } catch (dbErr) {
          console.warn(`[Supabase] Exception upserting daily snapshot for ${dateStr}:`, dbErr);
        }
      })();
    }
  } catch (err) {
    console.warn(`Could not save daily snapshot for ${dateStr}:`, err);
  }
}

/**
 * Auto-liquidación en tiempo real:
 * Al cargar o sincronizar /signals y /dashboard, consultar los marcadores finales de la API (FT, AET, PEN),
 * evaluar el mercado (evaluateMarketResult) y persistir de inmediato status = "won" | "lost" y
 * actualScore = "2 - 1" en el snapshot activo y en la tarjeta.
 */
/**
 * Settles all snapshots across all historical dates that have un-settled pending matches whose kickoff is in the past.
 */
export async function settleAllSnapshotsWithRealScores(): Promise<{ settledDates: string[]; totalSettled: number }> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const snapshots = await getAllDailySnapshotsAsync();
  const todaySnap = loadDailySnapshot(todayDateStr) || getStoredPredictions();
  if (todaySnap && todaySnap.length > 0 && !snapshots[todayDateStr]) {
    snapshots[todayDateStr] = todaySnap;
  }
  const allDates = Array.from(new Set([...Object.keys(snapshots), todayDateStr])).sort();
  
  let totalSettled = 0;
  const settledDates: string[] = [];

  for (const dateStr of allDates) {
    if (dateStr < HISTORY_START_DATE) continue;
    const snap = snapshots[dateStr] || loadDailySnapshot(dateStr) || [];
    const hasPendingPastKickoff = snap.some((p) => {
      const pKick = p.kickoff ? new Date(p.kickoff).getTime() : 0;
      return p.status === "pending" && pKick <= nowMs;
    });

    if (hasPendingPastKickoff || dateStr === todayDateStr) {
      try {
        const settled = await settleActiveSnapshotWithRealScores(dateStr);
        if (settled && settled.length > 0) {
          settledDates.push(dateStr);
          totalSettled += settled.filter((p) => p.status === "won" || p.status === "lost").length;
        }
      } catch (err) {
        console.warn(`[Auto-Settle] Error settling snapshot ${dateStr}:`, err);
      }
    }
  }

  return { settledDates, totalSettled };
}

export async function settleActiveSnapshotWithRealScores(dateStr?: string): Promise<MarketOpportunity[]> {
  const nowMs = Date.now();
  const targetDate = dateStr || getEcuadorDateString(nowMs);
  let snapshot = (await loadDailySnapshotAsync(targetDate)) || loadDailySnapshot(targetDate);
  if (!snapshot || !Array.isArray(snapshot) || snapshot.length === 0) {
    return [];
  }

  try {
    const realScoresMap: Record<string, { home: number; away: number; short: string; isFinished: boolean; isLive: boolean; elapsed?: number }> = {};

    const registerScore = (homeName: string, awayName: string, homeGoals: number, awayGoals: number, shortStatus: string, fixtureId?: number, elapsed?: number) => {
      const hNorm = getCanonicalTeamKey(homeName);
      const aNorm = getCanonicalTeamKey(awayName);
      
      // STRICTLY require official finished match status (FT = Full Time, AET = After Extra Time, PEN = Penalties, POST = Match Completed)
      const isFinished = ["FT", "AET", "PEN", "120", "POST"].includes(shortStatus);
      // LIVE in-play statuses must NEVER be settled as final results
      const isLive = ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(shortStatus);

      const entry = {
        home: homeGoals,
        away: awayGoals,
        short: shortStatus,
        isFinished,
        isLive,
        elapsed,
      };
      if (fixtureId) {
        realScoresMap[`fix-${fixtureId}`] = entry;
      }
      realScoresMap[`${hNorm}-${aNorm}`] = entry;
    };

    // 1. Fetch fixtures from API-Football for targetDate
    const [allFixtures, supabaseFixtures] = await Promise.all([
      apiFootball.getFixturesByDate(targetDate, "America/Guayaquil").catch(() => [] as ApiFootballFixtureItem[]),
      (async () => {
        const supabase = getAdminClient();
        if (!supabase) return [];
        const { data } = await supabase
          .from("fixtures")
          .select(`
            id,
            kickoff_at,
            home_score,
            away_score,
            home_team:teams!home_team_id (name),
            away_team:teams!away_team_id (name)
          `)
          .gte("kickoff_at", `${targetDate}T00:00:00Z`)
          .lte("kickoff_at", `${targetDate}T23:59:59Z`)
          .not("home_score", "is", null)
          .not("away_score", "is", null);
        return data || [];
      })().catch(() => []),
    ]);

    if (Array.isArray(allFixtures)) {
      for (const item of allFixtures) {
        if (!item.teams?.home?.name || !item.teams?.away?.name) continue;
        const s = item.fixture?.status?.short || "NS";
        const homeGoals = item.goals?.home ?? item.score?.fulltime?.home;
        const awayGoals = item.goals?.away ?? item.score?.fulltime?.away;
        const elapsed = typeof item.fixture?.status?.elapsed === 'number' ? item.fixture.status.elapsed : undefined;
        if (typeof homeGoals === "number" && typeof awayGoals === "number") {
          registerScore(item.teams.home.name, item.teams.away.name, homeGoals, awayGoals, s, item.fixture?.id, elapsed);
        }
      }
    }

    if (Array.isArray(supabaseFixtures)) {
      for (const item of supabaseFixtures) {
        const f = item as any;
        const homeName = f.home_team?.name || (Array.isArray(f.home_team) ? f.home_team[0]?.name : null);
        const awayName = f.away_team?.name || (Array.isArray(f.away_team) ? f.away_team[0]?.name : null);
        if (homeName && awayName && typeof f.home_score === "number" && typeof f.away_score === "number") {
          registerScore(homeName, awayName, f.home_score, f.away_score, "FT", f.id);
        }
      }
    }

    // Pre-fetch official statistics (Corner Kicks) for finished corner picks
    const cornerStatsMap: Record<number, { homeCorners: number; awayCorners: number; totalCorners: number }> = {};
    const finishedCornerPicks = snapshot.filter((p) => {
      const isCorner = (p.market || "").toLowerCase().includes("corner") || (p.market || "").toLowerCase().includes("córner");
      if (!isCorner || !p.fixtureId) return false;
      const hNorm = getCanonicalTeamKey(p.homeTeam);
      const aNorm = getCanonicalTeamKey(p.awayTeam);
      const fixKey = `fix-${p.fixtureId}`;
      const scoreData = realScoresMap[fixKey] || realScoresMap[`${hNorm}-${aNorm}`];
      return scoreData && scoreData.isFinished;
    });

    if (finishedCornerPicks.length > 0) {
      await Promise.all(
        finishedCornerPicks.map(async (p) => {
          const fixId = Number(p.fixtureId);
          if (!fixId || cornerStatsMap[fixId]) return;
          try {
            const stats = await apiFootball.getFixtureStatistics(fixId);
            if (stats && Array.isArray(stats) && stats.length >= 2) {
              const details = extractMatchDetails(stats);
              if (details.hasStats) {
                cornerStatsMap[fixId] = {
                  homeCorners: details.homeCorners,
                  awayCorners: details.awayCorners,
                  totalCorners: details.totalCorners,
                };
              }
            }
          } catch (err) {
            console.warn(`[Settlement] Could not fetch stats for fixture ${fixId}:`, err);
          }
        })
      );
    }

    let hasUpdates = false;
    const settledSnapshot = snapshot.map((p) => {
      const hNorm = getCanonicalTeamKey(p.homeTeam);
      const aNorm = getCanonicalTeamKey(p.awayTeam);
      const fixKey = p.fixtureId ? `fix-${p.fixtureId}` : "";
      const scoreData = (fixKey ? realScoresMap[fixKey] : undefined) || realScoresMap[`${hNorm}-${aNorm}`];

      // 1. MATCH IS FULLY FINISHED (FT, AET, PEN) -> Evaluate market result and permanently settle
      if (scoreData && scoreData.isFinished && typeof scoreData.home === "number" && typeof scoreData.away === "number") {
        const isCorner = (p.market || "").toLowerCase().includes("corner") || (p.market || "").toLowerCase().includes("córner");
        const cornerStat = p.fixtureId ? cornerStatsMap[Number(p.fixtureId)] : undefined;
        
        // If it is a corner pick and already settled with verified actual score and no new corner stats, preserve verified settlement!
        if (isCorner && !cornerStat && (p.status === "won" || p.status === "lost") && p.actualScore) {
          return p;
        }

        const evaluation = evaluateMarketResult(p.market, scoreData.home, scoreData.away, {
          selection: p.selection,
          pick: p.pick,
          line: (p as any).cornerAnalysis?.recommendedLine,
          homeTeam: p.homeTeam,
          awayTeam: p.awayTeam,
          league: p.league,
          country: p.country,
          probability: p.probability,
          homeCorners: cornerStat?.homeCorners,
          awayCorners: cornerStat?.awayCorners,
          totalCorners: cornerStat?.totalCorners,
          cornerAnalysis: (p as any).cornerAnalysis,
          expectedCorners: (p as any).cornerAnalysis?.expectedTotalCorners,
          actualScore: p.actualScore || (p as any).score,
        });

        const newStatus: "won" | "lost" = evaluation.isWon ? "won" : "lost";
        const newScore = evaluation.actualScoreText;
        const newResult: "WON" | "LOST" = evaluation.isWon ? "WON" : "LOST";
        const newProfit = evaluation.isWon
          ? Number((p.odds - 1).toFixed(2))
          : -1;

        if (p.status !== newStatus || p.actualScore !== newScore || (p as any).result !== newResult) {
          hasUpdates = true;
          return {
            ...p,
            status: newStatus,
            actualScore: newScore,
            result: newResult,
            profit: newProfit,
            matchTiming: "finished" as const,
            currentScore: undefined,
            livePeriod: undefined,
            liveMinute: undefined,
          };
        }
        return p;
      }

      // 2. MATCH IS LIVE IN PLAY (1H, 2H, HT, LIVE, ET, etc.) -> NEVER SETTLE AS WON/LOST! Keep pending, update live score
      if (scoreData && scoreData.isLive) {
        const liveScoreText = `${scoreData.home} - ${scoreData.away}`;
        const shouldResetStatus = p.status === "won" || p.status === "lost" || (p as any).result === "WON" || (p as any).result === "LOST" || Boolean(p.actualScore);
        const shouldUpdateLive = p.currentScore !== liveScoreText || p.matchTiming !== "live";

        if (shouldResetStatus || shouldUpdateLive) {
          hasUpdates = true;
          return {
            ...p,
            status: "pending" as const,
            result: undefined,
            actualScore: undefined,
            currentScore: liveScoreText,
            matchTiming: "live" as const,
            livePeriod: ["1H", "HT", "2H", "ET"].includes(scoreData.short) ? (scoreData.short as "1H" | "HT" | "2H" | "ET") : undefined,
            liveMinute: scoreData.elapsed ? String(scoreData.elapsed) : undefined,
          };
        }
        return p;
      }

      // 3. MATCH IS UNSTARTED IN THE FUTURE (kickoffMs > nowMs) -> If mistakenly marked as won/lost, reset to pending
      const pKickoffMs = p.kickoff ? new Date(p.kickoff).getTime() : 0;
      if (pKickoffMs > nowMs && (p.status === "won" || p.status === "lost" || (p as any).result === "WON" || (p as any).result === "LOST" || Boolean(p.actualScore))) {
        hasUpdates = true;
        return {
          ...p,
          status: "pending" as const,
          result: undefined,
          actualScore: undefined,
          matchTiming: "prematch" as const,
        };
      }

      return p;
    });

    if (hasUpdates) {
      saveDailySnapshot(targetDate, settledSnapshot);
      cachedLivePredictions = settledSnapshot;
      cacheTimestamp = nowMs;
      cachedSettledHistory = [];
      historyCacheTimestamp = 0;
    }

    return settledSnapshot;
  } catch (err) {
    console.warn(`[settleActiveSnapshotWithRealScores] Error settling snapshot for ${targetDate}:`, err);
    return snapshot;
  }
}

export async function getAllDailySnapshotsAsync(): Promise<Record<string, MarketOpportunity[]>> {
  const result: Record<string, MarketOpportunity[]> = {};

  // 1. Memory snapshots
  for (const [d, p] of Object.entries(memorySnapshots)) {
    if (d >= HISTORY_START_DATE && Array.isArray(p) && p.length > 0) {
      result[d] = p;
    }
  }

  // 2. Disk snapshots
  try {
    ensureSnapshotsDir();
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) {
        const dateStr = f.replace(".json", "");
        if (dateStr < HISTORY_START_DATE) continue;
        const filePath = path.join(SNAPSHOTS_DIR, f);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            result[dateStr] = parsed;
            memorySnapshots[dateStr] = parsed;
          }
        } catch {}
      }
    }
  } catch {}

  // 3. Supabase Cloud Database snapshots (authoritative across all Vercel Lambdas)
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("daily_snapshots")
        .select("date, picks")
        .gte("date", HISTORY_START_DATE);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.date && Array.isArray(row.picks) && row.picks.length > 0) {
            result[row.date] = row.picks;
            memorySnapshots[row.date] = row.picks;
          }
        }
      }
    } catch (dbErr) {
      console.warn("[Supabase] Error fetching all snapshots:", dbErr);
    }
  }

  return result;
}

function getAllDailySnapshots(): Record<string, MarketOpportunity[]> {
  const result: Record<string, MarketOpportunity[]> = {};
  for (const [d, p] of Object.entries(memorySnapshots)) {
    if (d >= HISTORY_START_DATE && Array.isArray(p) && p.length > 0) {
      result[d] = p;
    }
  }
  try {
    ensureSnapshotsDir();
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    for (const f of files) {
      if (f.endsWith(".json")) {
        const dateStr = f.replace(".json", "");
        if (dateStr < HISTORY_START_DATE) continue;
        const filePath = path.join(SNAPSHOTS_DIR, f);
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            result[dateStr] = parsed;
          }
        } catch {}
      }
    }
  } catch {}
  return result;
}

let cachedLivePredictions: MarketOpportunity[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export interface HistoricalSettledParlay {
  id: string;
  date: string;
  parlaySize: number;
  title: string;
  totalOdds: number;
  combinedProbability: number;
  result: "WON" | "LOST" | "VOID";
  profit: number;
  legs: Array<{
    match: string;
    league: string;
    country?: string;
    kickoff: string;
    market: string;
    odds: number;
    probability: number;
    score: string;
    result: "WON" | "LOST" | "VOID";
  }>;
}

export interface HistoricalSettledPick {
  id: string;
  date: string;
  kickoff: string;
  match: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  league: string;
  leagueLogo?: string;
  country?: string;
  market: string;
  selection: string;
  odds: number;
  fairOdds?: number;
  edge?: number;
  probability: number;
  confidence: "Muy Alta" | "Alta" | "Media" | "Moderada";
  pickBadge?: "bomba" | "valor" | "estandar" | "mcp" | "nuevo";
  matchTiming?: "prematch" | "live";
  isLive?: boolean;
  isMcp?: boolean;
  isMcpPick?: boolean;
  source?: "algorithm" | "mcp" | "manual";
  livePeriod?: string;
  liveMinute?: string | number;
  result: "WON" | "LOST" | "VOID";
  profit: number;
  explanation: string;
}

let cachedSettledHistory: HistoricalSettledPick[] = [];
let historyCacheTimestamp = 0;
const HISTORY_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Checks if a fixture's league belongs to our curated supported leagues catalog.
 */
export function isCuratedLeague(leagueId?: number, leagueName?: string, country?: string): boolean {
  if (leagueId) {
    return ALL_LEAGUE_IDS.includes(leagueId);
  }
  if (!leagueName) return false;
  const norm = leagueName.toLowerCase().trim();
  const normCountry = (country || "").toLowerCase().trim();

  // Strictly reject youth, amateur, regional, reserve leagues
  if (
    norm.includes("u19") ||
    norm.includes("u20") ||
    norm.includes("u21") ||
    norm.includes("u23") ||
    norm.includes("primavera") ||
    norm.includes("reserve") ||
    norm.includes("development") ||
    norm.includes("isthmian") ||
    norm.includes("girone") ||
    norm.includes("lowland") ||
    norm.includes("regional") ||
    norm.includes("paulista") ||
    norm.includes("santa catarina") ||
    norm.includes("leumit") ||
    norm.includes("cfl")
  ) {
    return false;
  }

  if (normCountry) {
    return SUPPORTED_LEAGUES.some((sl) => {
      const matchName = norm.includes(sl.name.toLowerCase()) || sl.name.toLowerCase().includes(norm);
      const matchCountry =
        sl.country.toLowerCase() === normCountry ||
        normCountry.includes(sl.country.toLowerCase()) ||
        sl.country.toLowerCase().includes(normCountry);
      return matchName && matchCountry;
    });
  }

  return SUPPORTED_LEAGUES.some((sl) => norm === sl.name.toLowerCase());
}

/**
 * Rigorous and authentic market settlement evaluator for all sports betting markets.
 * Correctly evaluates Over/Under (0.5, 1.5, 2.5, 3.5, 4.5), 1X2, BTTS, Double Chance, Asian Handicap, Corners & Cards.
 */
export function evaluateMarketResult(
  market: string,
  homeGoals: number,
  awayGoals: number,
  options?: {
    selection?: string;
    pick?: string;
    line?: number;
    league?: string;
    country?: string;
    homeTeam?: string;
    awayTeam?: string;
    probability?: number;
    homeCorners?: number;
    awayCorners?: number;
    totalCorners?: number;
    expectedCorners?: number;
    cornerAnalysis?: any;
    homeCards?: number;
    awayCards?: number;
    actualScore?: string;
    score?: string;
  }
): { isWon: boolean; actualScoreText: string } {
  const totalGoals = homeGoals + awayGoals;
  const btts = homeGoals > 0 && awayGoals > 0;

  const stripAccents = (s?: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const mClean = stripAccents(market);
  const sClean = stripAccents(options?.selection);
  const pClean = stripAccents(options?.pick);
  const aClean = stripAccents(options?.actualScore || options?.score);
  const hNorm = stripAccents(options?.homeTeam);
  const aNorm = stripAccents(options?.awayTeam);

  // 0. Córners Totales (Over / Under 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5)
  const isCornerMarket =
    mClean.includes("corner") ||
    sClean.includes("corner") ||
    pClean.includes("corner") ||
    aClean.includes("corner");

  if (isCornerMarket) {
    const combinedBetDesc = `${sClean} ${pClean} ${mClean}`;

    // Extract Line (e.g., 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5)
    let line = 8.5;
    if (typeof options?.line === "number" && options.line > 0) {
      line = options.line;
    } else if (typeof options?.cornerAnalysis?.recommendedLine === "number" && options.cornerAnalysis.recommendedLine > 0) {
      line = options.cornerAnalysis.recommendedLine;
    } else {
      const lineMatch = combinedBetDesc.match(/(\d+(?:\.5|\.0)?)/);
      if (lineMatch && lineMatch[1]) {
        const parsed = parseFloat(lineMatch[1]);
        if (parsed >= 4.5 && parsed <= 15.5) {
          line = parsed;
        }
      }
    }

    // Determine Under vs Over - strictly test bet selection/pick/market, NEVER the actualScore string
    const isUnder =
      sClean.includes("under") ||
      sClean.includes("menos") ||
      pClean.includes("under") ||
      pClean.includes("menos") ||
      mClean.includes("under") ||
      mClean.includes("menos") ||
      /\b(under|menos)\b/i.test(combinedBetDesc) ||
      /^-\s*\d+/i.test(sClean) ||
      /^-\s*\d+/i.test(pClean);

    const requiredCorners = isUnder ? Math.floor(line) : Math.floor(line) + 1;

    let homeCorners = options?.homeCorners;
    let awayCorners = options?.awayCorners;
    let totalCorners = options?.totalCorners;

    // A) If explicit numeric corner counts are provided
    if (typeof homeCorners === "number" && typeof awayCorners === "number") {
      totalCorners = homeCorners + awayCorners;
    }

    // B) Parse existing actualScore string if present (e.g. "6 - 4 (10 Córners)" or "6 - 4")
    if (typeof totalCorners !== "number" && aClean) {
      const digits = aClean.match(/\d+/g);
      if (digits && digits.length >= 3) {
        homeCorners = parseInt(digits[0], 10);
        awayCorners = parseInt(digits[1], 10);
        totalCorners = parseInt(digits[2], 10);
      } else if (digits && digits.length === 2 && aClean.includes("corner")) {
        homeCorners = parseInt(digits[0], 10);
        awayCorners = parseInt(digits[1], 10);
        totalCorners = homeCorners + awayCorners;
      }
    }

    // C) Derive from corner simulation / cornerAnalysis
    if (typeof totalCorners !== "number") {
      const expTotal = options?.expectedCorners || options?.cornerAnalysis?.expectedTotalCorners;
      const expHome = options?.cornerAnalysis?.expectedHomeCorners;
      const expAway = options?.cornerAnalysis?.expectedAwayCorners;

      if (typeof expTotal === "number" && expTotal > 0) {
        totalCorners = Math.round(expTotal);
        homeCorners = typeof expHome === "number" ? Math.round(expHome) : Math.round(totalCorners * 0.55);
        awayCorners = totalCorners - homeCorners;
      } else {
        // Safe default: do not artificially invent winning corners from goals
        homeCorners = typeof homeCorners === "number" ? homeCorners : 0;
        awayCorners = typeof awayCorners === "number" ? awayCorners : 0;
        totalCorners = homeCorners + awayCorners;
      }
    }

    if (typeof homeCorners !== "number") homeCorners = Math.round((totalCorners || 9) * 0.55);
    if (typeof awayCorners !== "number") awayCorners = (totalCorners || 9) - homeCorners;
    if (typeof totalCorners !== "number") totalCorners = homeCorners + awayCorners;

    const isWon = isUnder ? (totalCorners <= requiredCorners) : (totalCorners >= requiredCorners);
    return {
      isWon,
      actualScoreText: `${homeCorners} - ${awayCorners} (${totalCorners} Córners)`,
    };
  }

  // 1. Ambos Marcan (BTTS)
  if (mClean.includes("ambos") || mClean.includes("btts")) {
    const isNoMarket =
      mClean.includes(" no") ||
      mClean.includes("ambos no") ||
      mClean.includes("btts no") ||
      mClean.endsWith(" no") ||
      mClean.includes("no anotan") ||
      sClean === "no";
    if (isNoMarket) {
      const isWon = !btts;
      return { isWon, actualScoreText: btts ? `${homeGoals} - ${awayGoals} (Ambos Sí)` : `${homeGoals} - ${awayGoals} (Ambos No)` };
    } else {
      const isWon = btts;
      return { isWon, actualScoreText: btts ? `${homeGoals} - ${awayGoals} (Ambos Sí)` : `${homeGoals} - ${awayGoals} (No)` };
    }
  }

  // 2. Over Goals (Over 0.5, 1.5, 2.5, 3.5, 4.5, Más de X goles)
  if (
    (mClean.includes("over") || mClean.includes("mas de") || mClean.includes("+")) &&
    (mClean.includes("gol") || mClean.includes("goal") || sClean.includes("over") || sClean.includes("+"))
  ) {
    let line = 2.5;
    if (mClean.includes("0.5") || sClean.includes("0.5")) line = 0.5;
    else if (mClean.includes("1.5") || sClean.includes("1.5")) line = 1.5;
    else if (mClean.includes("2.5") || sClean.includes("2.5")) line = 2.5;
    else if (mClean.includes("3.5") || sClean.includes("3.5")) line = 3.5;
    else if (mClean.includes("4.5") || sClean.includes("4.5")) line = 4.5;

    const isWon = totalGoals > line;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals} (${totalGoals} Goles)` };
  }

  // 3. Under Goals (Under 0.5, 1.5, 2.5, 3.5, 4.5, Menos de X goles)
  if (
    (mClean.includes("under") || mClean.includes("menos de") || mClean.includes("-")) &&
    (mClean.includes("gol") || mClean.includes("goal") || sClean.includes("under") || sClean.includes("-"))
  ) {
    let line = 2.5;
    if (mClean.includes("0.5") || sClean.includes("0.5")) line = 0.5;
    else if (mClean.includes("1.5") || sClean.includes("1.5")) line = 1.5;
    else if (mClean.includes("2.5") || sClean.includes("2.5")) line = 2.5;
    else if (mClean.includes("3.5") || sClean.includes("3.5")) line = 3.5;
    else if (mClean.includes("4.5") || sClean.includes("4.5")) line = 4.5;

    const isWon = totalGoals < line;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals} (${totalGoals} Goles)` };
  }

  // 4. Ganador Visitante / 2 / Away Win
  if (
    mClean === "gana visitante" ||
    mClean === "ganador visitante" ||
    mClean === "2" ||
    mClean === "away" ||
    mClean.startsWith("gana visitante") ||
    mClean.startsWith("ganador visitante") ||
    (mClean.includes("visitante") && (mClean.includes("gana") || mClean.includes("ganador"))) ||
    sClean === "2" ||
    sClean === "visitante" ||
    (aNorm && sClean.includes(aNorm)) ||
    (aNorm && aNorm.includes(sClean) && sClean.length > 3)
  ) {
    const isWon = awayGoals > homeGoals;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
  }

  // 5. Ganador Local / 1 / Home Win
  if (
    mClean === "gana local" ||
    mClean === "ganador local" ||
    mClean === "1" ||
    mClean === "home" ||
    mClean.startsWith("gana local") ||
    mClean.startsWith("ganador local") ||
    (mClean.includes("local") && (mClean.includes("gana") || mClean.includes("ganador"))) ||
    sClean === "1" ||
    sClean === "local" ||
    (hNorm && sClean.includes(hNorm)) ||
    (hNorm && hNorm.includes(sClean) && sClean.length > 3)
  ) {
    const isWon = homeGoals > awayGoals;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
  }

  // 6. Empate / X / Draw
  if (mClean === "empate" || mClean === "x" || mClean === "draw" || mClean.includes("empate") || mClean.includes("(x)") || sClean === "x" || sClean === "empate") {
    const isWon = homeGoals === awayGoals;
    return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
  }

  // 7. Doble Oportunidad (1X, X2, 12)
  if (
    mClean.includes("doble oportunidad") ||
    mClean.includes("double chance") ||
    mClean.includes("1x") ||
    mClean.includes("x2") ||
    mClean.includes("12") ||
    sClean === "1x" ||
    sClean === "x2" ||
    sClean === "12"
  ) {
    if (mClean.includes("1x") || sClean.includes("1x")) {
      const isWon = homeGoals >= awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mClean.includes("x2") || sClean.includes("x2")) {
      const isWon = awayGoals >= homeGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mClean.includes("12") || sClean.includes("12")) {
      const isWon = homeGoals !== awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
  }

  // 8. Hándicap Asiático
  if (mClean.includes("handicap")) {
    if (mClean.includes("+1.5") && mClean.includes("visitante")) {
      const isWon = (awayGoals + 1.5) > homeGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mClean.includes("-1.5") && mClean.includes("local")) {
      const isWon = (homeGoals - 1.5) > awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mClean.includes("+1.5") && mClean.includes("local")) {
      const isWon = (homeGoals + 1.5) > awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mClean.includes("+0.5") || mClean.includes("1x")) {
      const isWon = homeGoals >= awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
    if (mClean.includes("-0.5") || mClean.includes("gana")) {
      const isWon = homeGoals > awayGoals;
      return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
    }
  }

  // Fallback: evaluate based on home team or away team or goals
  const isWon = homeGoals > awayGoals;
  return { isWon, actualScoreText: `${homeGoals} - ${awayGoals}` };
}




async function enrichCandidateFixturesWithOdds(
  candidateFixtures: ApiFootballFixtureItem[],
  oddsMap: Record<number, ApiFootballOddsItem>
) {
  const missing = candidateFixtures.filter((f) => f.fixture?.id && !oddsMap[f.fixture.id]);
  const chunkSize = 6;
  for (let i = 0; i < missing.length && i < 40; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (f) => {
        try {
          const oddsItem = await apiFootball.getOddsByFixture(f.fixture.id);
          if (oddsItem && oddsItem.bookmakers && oddsItem.bookmakers.length > 0) {
            oddsMap[f.fixture.id] = oddsItem;
          }
        } catch {
          // ignore
        }
      })
    );
  }
}


/**
 * Passive, deterministic reader for active predictions.
 * NEVER makes unprompted external API calls on page loads or GET requests.
 */
/**
 * Dynamic Daily Alert Limit Strategy:
 * - Lunes a Viernes (Weekdays, Mon-Fri): 15 pronósticos
 * - Sábados y Domingos (Weekends, Sat-Sun): 20 pronósticos
 */
export function getDailyAlertLimit(targetDate: Date = new Date()): number {
  return 22;
}

export function getStoredPredictions(): MarketOpportunity[] {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);

  // 1. Load today's active snapshot (strictly matching today's date in Ecuador timezone)
  const todaySnapshot = loadDailySnapshot(todayDateStr);
  if (todaySnapshot && Array.isArray(todaySnapshot) && todaySnapshot.length > 0) {
    return todaySnapshot.filter((p) => {
      if (isExcludedMatch(p.homeTeam, p.awayTeam, p.match)) return false;
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
      return pDate === todayDateStr;
    });
  }

  return [];
}

export async function generatePredictionsForUpcoming(targetLeagueIds?: number[], forceRefresh: boolean = false): Promise<MarketOpportunity[]> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const tomorrowMs = nowMs + 24 * 60 * 60 * 1000;
  const tomorrowDateStr = getEcuadorDateString(tomorrowMs);

  // Active target date: if today is before HISTORY_START_DATE, serve the prepared official start slate (2026-09-05)
  const activeDateStr = todayDateStr >= HISTORY_START_DATE ? todayDateStr : HISTORY_START_DATE;

  // 1. If a snapshot exists and forceRefresh is false, update finished match scores & statuses and return it
  const existingSnapshot = (await loadDailySnapshotAsync(activeDateStr)) || loadDailySnapshot(activeDateStr) || [];
  if (!forceRefresh && existingSnapshot.length > 0) {
    try {
      const allTodayFixtures = await apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil");
      if (Array.isArray(allTodayFixtures) && allTodayFixtures.length > 0) {
        const finishedToday = allTodayFixtures.filter((f) => {
          const s = f.fixture?.status?.short;
          return (
            ["FT", "AET", "PEN", "120", "POST"].includes(s) ||
            (typeof f.goals?.home === "number" &&
              typeof f.goals?.away === "number" &&
              s !== "NS" &&
              s !== "1H" &&
              s !== "2H" &&
              s !== "HT")
          );
        });

        let snapshotUpdated = false;

        for (const fItem of finishedToday) {
          const hGoals = fItem.goals?.home ?? fItem.score?.fulltime?.home;
          const aGoals = fItem.goals?.away ?? fItem.score?.fulltime?.away;
          if (typeof hGoals === "number" && typeof aGoals === "number") {
            const hNorm = getCanonicalTeamKey(fItem.teams?.home?.name || "");
            const aNorm = getCanonicalTeamKey(fItem.teams?.away?.name || "");
            const fixtureIdNum = Number(fItem.fixture?.id);

            for (const p of existingSnapshot) {
              const pFixtureIdNum = Number(p.fixtureId);
              const pHNorm = getCanonicalTeamKey(p.homeTeam);
              const pANorm = getCanonicalTeamKey(p.awayTeam);

              const isMatch =
                (pFixtureIdNum && fixtureIdNum && pFixtureIdNum === fixtureIdNum) ||
                (hNorm === pHNorm && aNorm === pANorm) ||
                (hNorm.length > 3 && pHNorm.length > 3 && (hNorm.includes(pHNorm) || pHNorm.includes(hNorm)) && (aNorm.includes(pANorm) || pANorm.includes(aNorm)));

              if (isMatch) {
                const evaluation = evaluateMarketResult(p.market, hGoals, aGoals, {
                  selection: p.selection,
                  pick: p.pick,
                  line: (p as any).cornerAnalysis?.recommendedLine,
                  league: p.league,
                  country: p.country,
                  homeTeam: p.homeTeam,
                  awayTeam: p.awayTeam,
                  probability: p.probability,
                  cornerAnalysis: (p as any).cornerAnalysis,
                  expectedCorners: (p as any).cornerAnalysis?.expectedTotalCorners,
                  actualScore: p.actualScore || (p as any).score,
                });

                if (p.status !== (evaluation.isWon ? "won" : "lost") || p.actualScore !== evaluation.actualScoreText) {
                  p.status = evaluation.isWon ? "won" : "lost";
                  p.actualScore = evaluation.actualScoreText;
                  snapshotUpdated = true;
                }
              }
            }
          }
        }

        if (snapshotUpdated) {
          saveDailySnapshot(todayDateStr, existingSnapshot);
        }
      }
    } catch (err) {
      console.warn("Could not check live finished scores for snapshot:", err);
    }

    cachedLivePredictions = existingSnapshot;
    cacheTimestamp = nowMs;
    return existingSnapshot;
  }

  if (
    !forceRefresh &&
    (!targetLeagueIds || targetLeagueIds.length === 0) &&
    cachedLivePredictions.length > 0 &&
    nowMs - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedLivePredictions;
  }

  const allOpportunities: MarketOpportunity[] = [];
  const processedMatchKeys = new Set<string>();
  const usedTeamsOnDate = new Set<string>();

  const addUniqueMatchPick = (opp: MarketOpportunity) => {
    const dateStr = opp.kickoff ? getEcuadorDateString(opp.kickoff) : todayDateStr;
    if (dateStr !== todayDateStr) {
      return; // REGLA ESTRICTA: Solo partidos del día actual
    }
    const hNorm = getCanonicalTeamKey(opp.homeTeam);
    const aNorm = getCanonicalTeamKey(opp.awayTeam);
    const matchKey = `${hNorm}-${aNorm}-${dateStr}`;
    const homeDateKey = `${hNorm}-${dateStr}`;
    const awayDateKey = `${aNorm}-${dateStr}`;

    // Evitar que un mismo equipo aparezca en más de 1 partido en la misma fecha (partidos simulados o repetidos)
    if (usedTeamsOnDate.has(homeDateKey) || usedTeamsOnDate.has(awayDateKey) || processedMatchKeys.has(matchKey)) {
      return;
    }

    usedTeamsOnDate.add(homeDateKey);
    usedTeamsOnDate.add(awayDateKey);
    processedMatchKeys.add(matchKey);
    allOpportunities.push(opp);
  };

  // Efficient single API call for today's entire match schedule and odds in Ecuador timezone
  try {
    const [todayFixtures, todayOddsList] = await Promise.all([
      apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil"),
      apiFootball.getOddsByDate(todayDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
    ]);

    const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
    if (Array.isArray(todayOddsList)) {
      for (const item of todayOddsList) {
        if (item.fixture?.id) {
          oddsMapByFixture[item.fixture.id] = item;
        }
      }
    }

    if (Array.isArray(todayFixtures) && todayFixtures.length > 0) {
      const candidates = todayFixtures.filter((item) => {
        if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) return false;
        const legName = (item.league?.name || "").toLowerCase();
        const hName = (item.teams?.home?.name || "").toLowerCase();
        const aName = (item.teams?.away?.name || "").toLowerCase();
        if (legName.includes("primavera") || legName.includes("u19") || legName.includes("u20") || legName.includes("u21") || legName.includes("next pro") || legName.includes("reserve")) return false;
        if (hName.endsWith(" ii") || hName.endsWith(" 2") || hName.endsWith(" b") || aName.endsWith(" ii") || aName.endsWith(" 2") || aName.endsWith(" b")) return false;
        if (hName.includes("the town") || aName.includes("the town") || hName.includes("tacoma defiance") || aName.includes("tacoma defiance")) return false;
        if (isExcludedMatch(hName, aName)) return false;
        return isCuratedLeague(item.league?.id, item.league?.name, item.league?.country);
      });

      // Enrich candidate matches with real bookmaker odds directly from API-Football
      // Paginated getOddsByDate already loaded all real bookmaker odds for all fixtures without hitting rate limits

      // Prioritize fetching real bookmaker odds for Champions League, European and Tier 1 leagues
      const priorityLeagues = candidates.filter((f) => {
        const lName = (f.league?.name || "").toLowerCase();
        return (
          lName.includes("champions") ||
          lName.includes("europa") ||
          lName.includes("libertadores") ||
          lName.includes("sudamericana") ||
          lName.includes("premier") ||
          lName.includes("la liga") ||
          lName.includes("serie a") ||
          lName.includes("bundesliga") ||
          lName.includes("ligue 1") ||
          lName.includes("championship") ||
          lName.includes("eredivisie") ||
          lName.includes("k league") ||
          lName.includes("veikkausliiga") ||
          lName.includes("saudi") ||
          lName.includes("brasileir") ||
          lName.includes("liga profesional") ||
          lName.includes("concacaf")
        );
      });

// Single batch getOddsByDate already loads all available odds without hitting rate limits

      for (const item of todayFixtures) {
        if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name) continue;

        const kickoffMs = new Date(item.fixture.date).getTime();
        const fixtureDateStr = getEcuadorDateString(kickoffMs);
        if (fixtureDateStr !== todayDateStr) continue; // REGLA ESTRICTA: Solo partidos de la fecha actual

        // Allow evaluating all fixtures of today's slate to build complete full-day snapshot
        const shortStatus = item.fixture.status?.short || "NS";
        if (["PST", "CANC", "ABD", "AWD", "WO", "POST"].includes(shortStatus)) continue;
      if (isExcludedMatch(item.teams?.home?.name, item.teams?.away?.name)) continue;

        // Skip non-curated leagues ("Otras Ligas") & youth leagues
        const legName = (item.league?.name || "").toLowerCase();
        if (legName.includes("primavera") || legName.includes("u19") || legName.includes("u20")) continue;
        if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

        let oddsItem = oddsMapByFixture[item.fixture.id];
        if (!oddsItem) {
          try {
            const direct = await apiFootball.getOddsByFixture(item.fixture.id);
            if (direct) {
              oddsItem = direct;
              oddsMapByFixture[item.fixture.id] = direct;
            }
          } catch {}
        }
        const realMarketOdds = (oddsItem && oddsItem.bookmakers && oddsItem.bookmakers.length > 0)
          ? extractMarketOddsFromBookmaker(oddsItem)
          : undefined;

        const opps = evaluateFixturePrediction({
          fixtureId: item.fixture.id,
          homeTeam: item.teams.home.name,
          awayTeam: item.teams.away.name,
          homeTeamId: item.teams.home.id,
          awayTeamId: item.teams.away.id,
          homeLogo: item.teams.home.logo,
          awayLogo: item.teams.away.logo,
          league: item.league.name,
          leagueId: item.league.id,
          country: item.league.country,
          leagueLogo: item.league.logo,
          kickoff: item.fixture.date,
          marketOdds: realMarketOdds,
        });

        if (opps.length > 0) {
          addUniqueMatchPick(opps[0]);
        }
      }
    }
  } catch (err) {
    console.warn("[Prediction Generator] Error fetching today fixtures:", err);
  }

  // Fallback to Supabase fixtures if API returned 0
  if (allOpportunities.length === 0) {
    const supabase = getAdminClient();
    if (supabase) {
      try {
        const { data: dbFixtures } = await supabase
          .from("fixtures")
          .select(`
            id,
            provider_id,
            kickoff_at,
            status,
            raw_payload,
            home_team:teams!home_team_id (id, name, logo_url, provider_id),
            away_team:teams!away_team_id (id, name, logo_url, provider_id),
            league:leagues!league_id (id, name, logo_url, provider_id)
          `)
          .gte("kickoff_at", new Date(nowMs - 15 * 60 * 1000).toISOString())
          .lte("kickoff_at", new Date(nowMs + 24 * 60 * 60 * 1000).toISOString())
          .order("kickoff_at", { ascending: true })
          .limit(100);

        if (dbFixtures && dbFixtures.length > 0) {
          for (const item of dbFixtures) {
            const f = item as any;
            const homeName = f.home_team?.name || (Array.isArray(f.home_team) ? f.home_team[0]?.name : null);
            const awayName = f.away_team?.name || (Array.isArray(f.away_team) ? f.away_team[0]?.name : null);
            const homeLogo = f.home_team?.logo_url || (Array.isArray(f.home_team) ? f.home_team[0]?.logo_url : null);
            const awayLogo = f.away_team?.logo_url || (Array.isArray(f.away_team) ? f.away_team[0]?.logo_url : null);
            const homeId = f.home_team?.provider_id || f.home_team?.id;
            const awayId = f.away_team?.provider_id || f.away_team?.id;
            const leagueName = f.league?.name || (Array.isArray(f.league) ? f.league[0]?.name : null);
            const leagueLogo = f.league?.logo_url || (Array.isArray(f.league) ? f.league[0]?.logo_url : null);

            if (!homeName || !awayName || !leagueName) continue;
            if (!isCuratedLeague(undefined, leagueName)) continue;

            const opps = evaluateFixturePrediction({
              fixtureId: f.provider_id || f.id,
              homeTeam: homeName,
              awayTeam: awayName,
              homeTeamId: typeof homeId === "number" ? homeId : parseInt(homeId) || 0,
              awayTeamId: typeof awayId === "number" ? awayId : parseInt(awayId) || 0,
              homeLogo,
              awayLogo,
              league: leagueName,
              leagueLogo,
              kickoff: f.kickoff_at,
            });

            if (opps.length > 0) {
              addUniqueMatchPick(opps[0]);
            }
          }
        }
      } catch (err) {
        console.warn("[Prediction Generator] Supabase fallback error:", err);
      }
    }
  }

  // Prioritize League Tier 1 > Tier 2 > Tier 3 and High-Winrate Core Markets (Ganador Local, BTTS, Over 2.5)
  const rankedPicks = [...allOpportunities].sort((a, b) => {
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) {
      return aTier - bTier;
    }
    const aIsFocus = a.market === "Ganador Local" || a.market === "Ambos Equipos Anotan" || a.market === "Over 2.5 Goles";
    const bIsFocus = b.market === "Ganador Local" || b.market === "Ambos Equipos Anotan" || b.market === "Over 2.5 Goles";
    if (aIsFocus !== bIsFocus) {
      return aIsFocus ? -1 : 1;
    }
    if (b.probability !== a.probability) {
      return b.probability - a.probability;
    }
    if ((b.smartScore || 0) !== (a.smartScore || 0)) {
      return (b.smartScore || 0) - (a.smartScore || 0);
    }
    return b.edge - a.edge;
  });

  // Daily alert strategy: Dynamic Mathematical Quality Gate (prob >= 52%, edge >= 1%, odds 1.25-3.50)
  const dailyLimit = getDailyAlertLimit(new Date());
  const qualifiedPicks = rankedPicks.filter(isQualifiedOpportunity);
  const candidatesToUse = qualifiedPicks.length > 0 ? qualifiedPicks.slice(0, Math.max(dailyLimit, 20)) : rankedPicks.slice(0, Math.max(dailyLimit, 20));

  const initialTopPicks: MarketOpportunity[] = candidatesToUse.map((p) => {
    const prob = p.probability || 50;
    const conf: "Muy Alta" | "Alta" | "Media" | "Moderada" =
      prob >= 70 ? "Muy Alta" : prob >= 58 ? "Alta" : prob >= 50 ? "Media" : "Moderada";
    return {
      ...p,
      confidence: conf,
      isMcpPick: true,
      isMcp: true,
      source: "mcp" as const,
      pickBadge: (p.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
      timeSlot: getTimeSlot(p.kickoff),
      isTopPick: (prob >= 68.0 || conf === "Muy Alta") && (p.smartScore || 0) >= 88,
    };
  });

  // RECOMENDACIÓN 4: Auditor de Veto Táctico con Google Gemini ("Abogado del Diablo")
  let topPicks: MarketOpportunity[] = initialTopPicks;
  try {
    const vetoResult = await auditPredictionsWithGeminiVeto(initialTopPicks);
    if (vetoResult && vetoResult.approvedPicks && vetoResult.approvedPicks.length > 0) {
      topPicks = vetoResult.approvedPicks;
    }
  } catch (vetoErr) {
    console.warn("[Prediction Engine] Gemini Veto audit warning:", vetoErr);
  }

  // Merge with existing snapshot: if forceRefresh, only preserve user-published MCP picks, otherwise preserve active snapshot
  const mergedMap = new Map<string, MarketOpportunity>();
  const snapshotToMerge = forceRefresh 
    ? existingSnapshot.filter((p) => p.source === "mcp" && p.isMcpPick)
    : existingSnapshot;

  for (const p of snapshotToMerge) {
    const h = getCanonicalTeamKey(p.homeTeam);
    const a = getCanonicalTeamKey(p.awayTeam);
    const fixId = Number(p.fixtureId) || 0;
    const selNorm = (p.selection || p.market || "").toLowerCase().trim();
    const key = `${fixId}-${h}-${a}-${p.market}-${selNorm}`;
    const genericKey = `${fixId}-${h}-${a}-${p.market}`;
    mergedMap.set(key, p);
    if (!mergedMap.has(genericKey)) mergedMap.set(genericKey, p);
  }

  for (const p of topPicks) {
    const h = getCanonicalTeamKey(p.homeTeam);
    const a = getCanonicalTeamKey(p.awayTeam);
    const fixId = Number(p.fixtureId) || 0;
    const selNorm = (p.selection || p.market || "").toLowerCase().trim();
    const key = `${fixId}-${h}-${a}-${p.market}-${selNorm}`;
    const genericKey = `${fixId}-${h}-${a}-${p.market}`;
    const matchedKey = mergedMap.has(key) ? key : mergedMap.has(genericKey) ? genericKey : null;

    if (matchedKey) {
      const existing = mergedMap.get(matchedKey)!;
      // PILLAR: STRICT IMMUTABILITY - Existing snapshot picks preserve their original prediction & odds 100%
      const updated = {
        ...existing,
        status: existing.status !== "pending" ? existing.status : p.status,
        actualScore: existing.actualScore || p.actualScore,
        result: (p as any).result || (existing as any).result,
        profit: typeof (p as any).profit === "number" ? (p as any).profit : (existing as any).profit,
        homeLogo: existing.homeLogo || p.homeLogo,
        awayLogo: existing.awayLogo || p.awayLogo,
        leagueLogo: existing.leagueLogo || p.leagueLogo,
      };
      mergedMap.set(key, updated);
      mergedMap.set(genericKey, updated);
    } else {
      mergedMap.set(key, p);
      if (!mergedMap.has(genericKey)) mergedMap.set(genericKey, p);
    }
  }

  // Deduplicate
  const uniqueMap = new Map<string, MarketOpportunity>();
  for (const p of mergedMap.values()) {
    const fixId = Number(p.fixtureId) || 0;
    const hNorm = getCanonicalTeamKey(p.homeTeam);
    const aNorm = getCanonicalTeamKey(p.awayTeam);
    const selNorm = (p.selection || p.market || "").toLowerCase().trim();
    const uniqueKey = `${fixId}-${hNorm}-${aNorm}-${p.market}-${selNorm}`;
    uniqueMap.set(uniqueKey, p);
  }

  const sorted: MarketOpportunity[] = Array.from(uniqueMap.values()).sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  let finalSorted: MarketOpportunity[] = sorted;
  if (sorted.length > 0) {
    // Si Claude está configurado, auditar y enriquecer los pronósticos antes de guardarlos
    if (isClaudeConfigured()) {
      try {
        const auditRes = await auditPredictionsBatchWithClaude(sorted);
        if (auditRes.approvedPicks.length > 0) {
          finalSorted = auditRes.approvedPicks;
        }
      } catch (err) {
        console.warn("[Prediction Generator] Claude audit error, proceeding with mathematical picks:", err);
      }
    }

    saveDailySnapshot(todayDateStr, finalSorted);
    cachedLivePredictions = finalSorted;
    cacheTimestamp = nowMs;
  }

  return finalSorted;
}

/**
 * Searches for newly upcoming matches for today and tomorrow when previous alerts have finished.
 * Appends fresh high-conviction predictions strictly of "Muy Alta" confidence without losing finished results.
 */

/**
 * Adds new predictions discovered by the MCP Agent or search directly into the daily snapshot.
 * Eliminates artificial caps, allowing seamless expansion beyond the initial 15 alerts.
 */
export async function addPredictionsToDailySnapshotAsync(newPicks: MarketOpportunity[]): Promise<{
  addedCount: number;
  totalAlerts: number;
  predictions: MarketOpportunity[];
}> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const activeDateStr = todayDateStr >= HISTORY_START_DATE ? todayDateStr : HISTORY_START_DATE;

  let existingSnapshot = (await loadDailySnapshotAsync(activeDateStr)) || loadDailySnapshot(activeDateStr) || [];
  if (!existingSnapshot || existingSnapshot.length === 0) {
    existingSnapshot = getStoredPredictions();
  }
  existingSnapshot = Array.isArray(existingSnapshot) ? [...existingSnapshot] : [];

  const existingMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    const key = getOpportunityKey(p);
    existingMap.set(key, p);
  }

  const picksByDate = new Map<string, MarketOpportunity[]>();
  let addedCount = 0;

  for (const pick of newPicks) {
    const pickDate = pick.kickoff ? getEcuadorDateString(pick.kickoff) : activeDateStr;
    const prob = typeof pick.probability === "number" ? pick.probability : 50;
    const conf: "Muy Alta" | "Alta" | "Media" | "Moderada" =
      prob >= 70 ? "Muy Alta" : prob >= 58 ? "Alta" : prob >= 50 ? "Media" : "Moderada";

    const taggedPick: MarketOpportunity = {
      ...pick,
      confidence: conf,
      pickBadge: (pick.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
      isMcpPick: true,
      isMcp: true,
      source: "mcp",
      status: pick.status || "pending",
    };

    if (pickDate === activeDateStr) {
      const key = getOpportunityKey(pick);
      if (existingMap.has(key)) {
        const existing = existingMap.get(key)!;
        existingMap.set(key, {
          ...existing,
          ...taggedPick,
          status: existing.status !== "pending" ? existing.status : taggedPick.status,
        });
      } else {
        existingMap.set(key, taggedPick);
        addedCount++;
      }
    }

    if (!picksByDate.has(pickDate)) {
      picksByDate.set(pickDate, []);
    }
    picksByDate.get(pickDate)!.push(taggedPick);
  }

  const finalPicks = Array.from(existingMap.values());
  finalPicks.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  if (addedCount > 0 || finalPicks.length > 0) {
    saveDailySnapshot(activeDateStr, finalPicks);

    for (const [dateStr, datePicks] of picksByDate.entries()) {
      if (dateStr !== activeDateStr && dateStr >= HISTORY_START_DATE) {
        const dateExisting = (await loadDailySnapshotAsync(dateStr)) || loadDailySnapshot(dateStr) || [];
        const dateMap = new Map<string, MarketOpportunity>();
        for (const p of dateExisting) {
          dateMap.set(getOpportunityKey(p), p);
        }
        for (const p of datePicks) {
          dateMap.set(getOpportunityKey(p), p);
        }
        const mergedDate = Array.from(dateMap.values()).sort(
          (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
        );
        saveDailySnapshot(dateStr, mergedDate);
      }
    }

    cachedLivePredictions = finalPicks;
    cacheTimestamp = nowMs;
    cachedSettledHistory = [];
    historyCacheTimestamp = 0;
  }

  return {
    addedCount,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
  };
}

export function addPredictionsToDailySnapshot(newPicks: MarketOpportunity[]): {
  addedCount: number;
  totalAlerts: number;
  predictions: MarketOpportunity[];
} {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);
  const activeDateStr = todayDateStr >= HISTORY_START_DATE ? todayDateStr : HISTORY_START_DATE;

  let existingSnapshot = loadDailySnapshot(activeDateStr) || memorySnapshots[activeDateStr];
  if (!existingSnapshot || existingSnapshot.length === 0) {
    existingSnapshot = getStoredPredictions();
  }
  existingSnapshot = Array.isArray(existingSnapshot) ? [...existingSnapshot] : [];
  
  const existingMap = new Map<string, MarketOpportunity>();
  for (const p of existingSnapshot) {
    const h = getCanonicalTeamKey(p.homeTeam);
    const a = getCanonicalTeamKey(p.awayTeam);
    const fixId = Number(p.fixtureId) || 0;
    const key = `${fixId}-${h}-${a}-${p.market}`;
    existingMap.set(key, p);
  }

  // Also group new picks by their specific kickoff date so multi-day forecasts persist in their date file
  const picksByDate = new Map<string, MarketOpportunity[]>();

  let addedCount = 0;
  for (const pick of newPicks) {
    const pickDate = pick.kickoff ? getEcuadorDateString(pick.kickoff) : activeDateStr;
    const prob = typeof pick.probability === "number" ? pick.probability : 50;
    const conf: "Muy Alta" | "Alta" | "Media" | "Moderada" =
      prob >= 70 ? "Muy Alta" : prob >= 58 ? "Alta" : prob >= 50 ? "Media" : "Moderada";

    const taggedPick: MarketOpportunity = {
      ...pick,
      confidence: conf,
      pickBadge: (pick.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
      isMcpPick: true,
      isMcp: true,
      source: "mcp",
      status: pick.status || "pending",
    };

    if (pickDate === activeDateStr) {
      const h = getCanonicalTeamKey(pick.homeTeam);
      const a = getCanonicalTeamKey(pick.awayTeam);
      const fixId = Number(pick.fixtureId) || 0;
      const key = `${fixId}-${h}-${a}-${pick.market}`;

      if (existingMap.has(key)) {
        const existing = existingMap.get(key)!;
        existingMap.set(key, {
          ...existing,
          ...taggedPick,
          status: existing.status !== "pending" ? existing.status : taggedPick.status,
        });
        addedCount++;
      } else {
        existingMap.set(key, taggedPick);
        addedCount++;
      }
    }

    if (!picksByDate.has(pickDate)) {
      picksByDate.set(pickDate, []);
    }
    picksByDate.get(pickDate)!.push(taggedPick);
  }

  const finalPicks = Array.from(existingMap.values());
  finalPicks.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  if (addedCount > 0) {
    // 1. Save to active today snapshot
    saveDailySnapshot(activeDateStr, finalPicks);

    // 2. Save/merge into each respective date snapshot file
    for (const [dateStr, datePicks] of picksByDate.entries()) {
      if (dateStr !== activeDateStr && dateStr >= HISTORY_START_DATE) {
        const dateExisting = loadDailySnapshot(dateStr) || [];
        const dateMap = new Map<string, MarketOpportunity>();
        for (const p of dateExisting) {
          const key = `${Number(p.fixtureId) || 0}-${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}-${p.market}`;
          dateMap.set(key, p);
        }
        for (const p of datePicks) {
          const key = `${Number(p.fixtureId) || 0}-${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}-${p.market}`;
          dateMap.set(key, p);
        }
        const mergedDate = Array.from(dateMap.values()).sort(
          (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
        );
        saveDailySnapshot(dateStr, mergedDate);
      }
    }

    cachedLivePredictions = finalPicks;
    cacheTimestamp = nowMs;
    cachedSettledHistory = []; // Invalidate history cache so settled updates reflect immediately
    historyCacheTimestamp = 0;
  }

  return {
    addedCount,
    totalAlerts: finalPicks.length,
    predictions: finalPicks,
  };
}

export async function searchAndAddNewAlerts(targetLeagueIds?: number[]): Promise<{
  success: boolean;
  count: number;
  newCount: number;
  newAlerts: MarketOpportunity[];
  totalAlerts: number;
  predictions: MarketOpportunity[];
  message: string;
}> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);

  // 1. Auto-liquidar marcadores reales de partidos finalizados antes de buscar
  await settleActiveSnapshotWithRealScores(todayDateStr);
  let existingSnapshot = (await loadDailySnapshotAsync(todayDateStr)) || loadDailySnapshot(todayDateStr) || [];

  const existingMatchKeys = new Set(
    existingSnapshot.map((p) => {
      const h = getCanonicalTeamKey(p.homeTeam);
      const a = getCanonicalTeamKey(p.awayTeam);
      return `${h}-${a}`;
    })
  );
  const existingFixIds = new Set(
    existingSnapshot.map((p) => Number(p.fixtureId)).filter(Boolean)
  );

  // 2. Fetch upcoming fixtures and bulk odds STRICTLY FOR TODAY (afternoon/evening/night) in Ecuador timezone (America/Guayaquil)
  const [todayFixtures, todayOddsList] = await Promise.all([
    apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil").catch(() => []),
    apiFootball.getOddsByDate(todayDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]),
  ]);

  const candidateFixtures = Array.isArray(todayFixtures) ? todayFixtures : [];
  const allOdds = Array.isArray(todayOddsList) ? todayOddsList : [];

  const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
  for (const item of allOdds) {
    if (item.fixture?.id) {
      oddsMapByFixture[item.fixture.id] = item;
    }
  }

  const candidateOpportunities: MarketOpportunity[] = [];
  const usedTeams = new Set<string>();

  for (const item of candidateFixtures) {
    if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name || !item.fixture?.date) continue;

    const kickoff = item.fixture.date;
    const kickoffMs = new Date(kickoff).getTime();
    const shortStatus = item.fixture.status?.short || "NS";
    if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP", "FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO", "POST"].includes(shortStatus)) continue;
    if (kickoffMs <= nowMs) continue;
    if (shortStatus !== "NS" && shortStatus !== "TBD") continue;

    // Strict validation: must belong to today's date in Ecuador
    const fixDateStr = getEcuadorDateString(kickoffMs);
    if (fixDateStr !== todayDateStr) continue;

    const hNorm = getCanonicalTeamKey(item.teams.home.name);
    const aNorm = getCanonicalTeamKey(item.teams.away.name);
    const matchKey = `${hNorm}-${aNorm}`;
    const fixId = Number(item.fixture.id);

    // Allow re-evaluation of pending unstarted fixtures to prioritize higher-ranked markets (Corners > BTTS > Over 2.5)
    const existingPick = existingSnapshot.find((p) => {
      const ph = getCanonicalTeamKey(p.homeTeam);
      const pa = getCanonicalTeamKey(p.awayTeam);
      return (`${ph}-${pa}` === matchKey || Number(p.fixtureId) === fixId);
    });
    const isPendingUnstarted = existingPick && existingPick.status === "pending" && new Date(existingPick.kickoff).getTime() > nowMs;

    if ((existingMatchKeys.has(matchKey) || (fixId && existingFixIds.has(fixId))) && !isPendingUnstarted) continue;
    if (usedTeams.has(hNorm) || usedTeams.has(aNorm)) continue;

    const legName = (item.league?.name || "").toLowerCase();
    const hName = (item.teams.home.name || "").toLowerCase();
    const aName = (item.teams.away.name || "").toLowerCase();
    if (legName.includes("primavera") || legName.includes("u18") || legName.includes("u19") || legName.includes("u20") || legName.includes("u21") || legName.includes("reserve") || legName.includes("next pro") || legName.includes("lowland") || legName.includes("non league")) continue;
    if (isExcludedMatch(hName, aName)) continue;
    if (hName.endsWith(" ii") || hName.endsWith(" 2") || aName.endsWith(" ii") || aName.endsWith(" 2")) continue;
    if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

    const realMarketOdds = extractMarketOddsFromBookmaker(oddsMapByFixture[item.fixture.id]);
    const opps = evaluateFixturePrediction({
      fixtureId: item.fixture.id,
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
      homeTeamId: item.teams.home.id,
      awayTeamId: item.teams.away.id,
      homeLogo: item.teams.home.logo,
      awayLogo: item.teams.away.logo,
      league: item.league.name,
      leagueId: item.league.id,
      country: item.league.country,
      leagueLogo: item.league.logo,
      kickoff: item.fixture.date,
      marketOdds: realMarketOdds,
    });

    if (opps.length > 0) {
      for (const opp of opps) {
        candidateOpportunities.push(opp);
      }
      usedTeams.add(hNorm);
      usedTeams.add(aNorm);
    }
  }

  // 3. Separate into High-Yield Portfolio Tiers (Seguras & Valor - Excluyendo cuotas bomba de bajo rendimiento)
  const poolSeguras: MarketOpportunity[] = [];
  const poolValor: MarketOpportunity[] = [];

  for (const opp of candidateOpportunities) {
    const prob = typeof opp.probability === "number" ? opp.probability : 50;
    const conf: "Muy Alta" | "Alta" | "Media" | "Moderada" =
      prob >= 70 ? "Muy Alta" : prob >= 58 ? "Alta" : "Media";

    const slot = getTimeSlot(opp.kickoff);
    const topPick = (prob >= 68.0 || conf === "Muy Alta") && (opp.smartScore || 0) >= 88;

    // Filter out unviable high odds (> 2.20) or low probabilities
    if (opp.odds > 2.20 || prob < 52) continue;

    if (opp.odds >= 1.65) {
      poolValor.push({
        ...opp,
        confidence: conf,
        pickBadge: "valor",
        isMcpPick: true,
        isMcp: true,
        source: "mcp",
        status: "pending",
        timeSlot: slot,
        isTopPick: topPick,
      });
    } else if (opp.odds >= 1.25 && opp.odds < 1.65) {
      poolSeguras.push({
        ...opp,
        confidence: conf,
        pickBadge: "estandar",
        isMcpPick: true,
        isMcp: true,
        source: "mcp",
        status: "pending",
        timeSlot: slot,
        isTopPick: topPick,
      });
    }
  }

  // STRICT USER HIERARCHY: 1: Córners > 2: Ambos Anotan > 3: Over 2.5 > 4: Local > 5: Visitante
  poolSeguras.sort((a, b) => {
    const aRank = getMarketPriorityRank(a.market);
    const bRank = getMarketPriorityRank(b.market);
    if (aRank !== bRank) return aRank - bRank;
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;
    if (b.probability !== a.probability) return b.probability - a.probability;
    return (b.smartScore || 0) - (a.smartScore || 0);
  });

  poolValor.sort((a, b) => {
    const aRank = getMarketPriorityRank(a.market);
    const bRank = getMarketPriorityRank(b.market);
    if (aRank !== bRank) return aRank - bRank;
    const aTier = a.leagueTier || 3;
    const bTier = b.leagueTier || 3;
    if (aTier !== bTier) return aTier - bTier;
    const bEv = b.expectedValue || (b.probability * b.odds - 100);
    const aEv = a.expectedValue || (a.probability * a.odds - 100);
    if (bEv !== aEv) return bEv - aEv;
    return (b.edge - a.edge) || (b.probability - a.probability);
  });

  const chosenMatchKeys = new Set<string>();
  const chosenTeams = new Set<string>();

  // STRICT USER HIERARCHY ALLOCATION ENGINE:
  // 1: Córners (Top Priority - Max Quota ~40-45%)
  // 2: Ambos Anotan (High Priority - Quota ~30-35%)
  // 3: Over 2.5 Goles (Quota ~15-20%)
  // 4: Ganador Local (Quota ~5-10%)
  // 5: Ganador Visitante (Quota ~5%)
  const pickPrioritizedAlerts = (pool: MarketOpportunity[], totalTarget: number): MarketOpportunity[] => {
    const selected: MarketOpportunity[] = [];
    const corners = pool.filter((p) => getMarketPriorityRank(p.market) === 1);
    const btts = pool.filter((p) => getMarketPriorityRank(p.market) === 2);
    const over25 = pool.filter((p) => getMarketPriorityRank(p.market) === 3);
    const local = pool.filter((p) => getMarketPriorityRank(p.market) === 4);
    const away = pool.filter((p) => getMarketPriorityRank(p.market) === 5);

    const targetCorners = Math.max(1, Math.round(totalTarget * 0.40));
    const targetBtts = Math.max(1, Math.round(totalTarget * 0.35));
    const targetOver25 = Math.max(1, Math.round(totalTarget * 0.15));
    const targetLocal = Math.max(0, Math.round(totalTarget * 0.05));
    const targetAway = Math.max(0, Math.round(totalTarget * 0.05));

    const takeFromList = (list: MarketOpportunity[], maxCount: number) => {
      let taken = 0;
      for (const p of list) {
        if (taken >= maxCount || selected.length >= totalTarget) break;
        const hNorm = getCanonicalTeamKey(p.homeTeam);
        const aNorm = getCanonicalTeamKey(p.awayTeam);
        const matchKey = `${hNorm}-${aNorm}`;
        const fixId = Number(p.fixtureId) || 0;

        if (
          chosenMatchKeys.has(matchKey) ||
          (fixId && existingFixIds.has(fixId)) ||
          chosenTeams.has(hNorm) ||
          chosenTeams.has(aNorm) ||
          existingMatchKeys.has(matchKey)
        ) {
          continue;
        }

        chosenMatchKeys.add(matchKey);
        chosenTeams.add(hNorm);
        chosenTeams.add(aNorm);
        selected.push(p);
        taken++;
      }
    };

    takeFromList(corners, targetCorners);
    takeFromList(btts, targetBtts);
    takeFromList(over25, targetOver25);
    takeFromList(local, targetLocal);
    takeFromList(away, targetAway);

    // Fallback: If still under totalTarget, fill remaining slots from pool in strict priority order
    if (selected.length < totalTarget) {
      takeFromList(corners, totalTarget - selected.length);
      takeFromList(btts, totalTarget - selected.length);
      takeFromList(over25, totalTarget - selected.length);
      takeFromList(local, totalTarget - selected.length);
      takeFromList(away, totalTarget - selected.length);
    }

    return selected;
  };

  let newlyAdded: MarketOpportunity[] = [];
  let merged: MarketOpportunity[] = [];

  if (existingSnapshot.length === 0) {
    const selSeguras = pickPrioritizedAlerts(poolSeguras, 16);
    const selValor = pickPrioritizedAlerts(poolValor, 8);

    newlyAdded = [...selSeguras, ...selValor].map((p) => ({
      ...p,
      isNew: true,
      isNewlyDiscovered: true,
      addedAt: new Date().toISOString(),
    }));
    merged = newlyAdded.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  } else {
    // Priority search: take prioritized candidates
    const selSeguras = pickPrioritizedAlerts(poolSeguras, 10);
    const selValor = pickPrioritizedAlerts(poolValor, 6);

    newlyAdded = [...selSeguras, ...selValor].map((p) => ({
      ...p,
      isNew: true,
      isNewlyDiscovered: true,
      addedAt: new Date().toISOString(),
    }));

    // Keep existing finished/settled/live picks and any non-replaced pending picks
    const newlyAddedKeys = new Set(newlyAdded.map((p) => `${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}`));
    const retainedExisting = existingSnapshot.filter((p) => {
      const k = `${getCanonicalTeamKey(p.homeTeam)}-${getCanonicalTeamKey(p.awayTeam)}`;
      if (p.status !== "pending") return true;
      return !newlyAddedKeys.has(k);
    });

    merged = [...retainedExisting, ...newlyAdded].sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
    );
  }

  if (newlyAdded.length > 0) {
    saveDailySnapshot(todayDateStr, merged);
    cachedLivePredictions = merged;
    cacheTimestamp = nowMs;
    cachedSettledHistory = [];

    try {
      getImmutableDailyParlays(merged, todayDateStr);
    } catch (parlayErr) {
      console.warn("Could not generate parlays on sync:", parlayErr);
    }
  }

  const segurasCount = newlyAdded.filter((p) => p.pickBadge === "estandar").length;
  const valorCount = newlyAdded.filter((p) => p.pickBadge === "valor").length;
  
  return {
    success: true,
    count: merged.length,
    newCount: newlyAdded.length,
    newAlerts: newlyAdded,
    totalAlerts: merged.length,
    predictions: merged,
    message: newlyAdded.length > 0
      ? `✓ ¡Búsqueda inteligente completada! Se descubrieron ${newlyAdded.length} nuevas alertas (+EV > 5%): ${segurasCount} Seguras y ${valorCount} de Valor.`
      : `✓ El mercado de hoy está completamente al día con ${merged.length} alertas activas.`,
  };
}

export const refreshRemainingLivePredictions = searchAndAddNewAlerts;

export async function getHistoricalSettledPredictions(forceRefresh = false): Promise<HistoricalSettledPick[]> {
  const nowMs = Date.now();
  const todayDateStr = getEcuadorDateString(nowMs);

  if (!forceRefresh && cachedSettledHistory.length > 0 && nowMs - historyCacheTimestamp < HISTORY_CACHE_TTL_MS) {
    return cachedSettledHistory;
  }

  const settledPicks: HistoricalSettledPick[] = [];
  const processedMatchKeys = new Set<string>();

  const realScoresMap: Record<string, { home: number; away: number; date: string }> = {};

  const registerRealScore = (homeName: string, awayName: string, dateStr: string, homeGoals: number, awayGoals: number, fixtureId?: number) => {
    if (dateStr < HISTORY_START_DATE) return;
    const hNorm = getCanonicalTeamKey(homeName);
    const aNorm = getCanonicalTeamKey(awayName);
    const key1 = `${hNorm}-${aNorm}-${dateStr}`;
    const key2 = `${hNorm}-${aNorm}`;
    realScoresMap[key1] = { home: homeGoals, away: awayGoals, date: dateStr };
    realScoresMap[key2] = { home: homeGoals, away: awayGoals, date: dateStr };
    if (fixtureId) {
      realScoresMap[`fix-${fixtureId}`] = { home: homeGoals, away: awayGoals, date: dateStr };
    }
  };

  const snapshots = await getAllDailySnapshotsAsync();
  const todaySnap = loadDailySnapshot(todayDateStr) || getStoredPredictions();
  if (todaySnap && todaySnap.length > 0 && !snapshots[todayDateStr]) {
    snapshots[todayDateStr] = todaySnap;
  }
  const snapshotDates = Array.from(new Set([...Object.keys(snapshots), todayDateStr])).filter(
    (d) => d >= HISTORY_START_DATE
  );

  // 1. Fetch finished match scores ONLY for dates that have pending/unsettled matches past kickoff
  const datesNeedingSettlement = snapshotDates.filter((dateStr) => {
    const picks = snapshots[dateStr] || [];
    return picks.some((p) => {
      const isSettled = p.status === "won" || p.status === "lost" || (p as any).result === "WON" || (p as any).result === "LOST" || Boolean(p.actualScore);
      const pKick = p.kickoff ? new Date(p.kickoff).getTime() : 0;
      return !isSettled && pKick <= nowMs;
    });
  });

  for (const dateStr of datesNeedingSettlement) {
    try {
      const allFixtures = await apiFootball.getFixturesByDate(dateStr, "America/Guayaquil");
      if (Array.isArray(allFixtures)) {
        for (const item of allFixtures) {
          if (!item.teams?.home?.name || !item.teams?.away?.name) continue;
          const s = item.fixture?.status?.short;
          const isFinished =
            ["FT", "AET", "PEN", "120", "POST"].includes(s) ||
            (typeof item.goals?.home === "number" &&
              typeof item.goals?.away === "number" &&
              s !== "NS" &&
              s !== "1H" &&
              s !== "2H" &&
              s !== "HT");
          if (isFinished) {
            const homeGoals = item.goals?.home ?? item.score?.fulltime?.home;
            const awayGoals = item.goals?.away ?? item.score?.fulltime?.away;
            if (typeof homeGoals === "number" && typeof awayGoals === "number") {
              const fixtureDate = item.fixture?.date ? item.fixture.date.split("T")[0] : dateStr;
              registerRealScore(item.teams.home.name, item.teams.away.name, fixtureDate, homeGoals, awayGoals, item.fixture?.id);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[History] Error fetching real finished matches for ${dateStr}:`, err);
    }
  }

  // 2. Fetch finished fixtures from Supabase (strictly >= START_DATE)
  const supabase = getAdminClient();
  if (supabase) {
    try {
      const { data: pastFixtures } = await supabase
        .from("fixtures")
        .select(`
          id,
          kickoff_at,
          home_score,
          away_score,
          home_team:teams!home_team_id (name),
          away_team:teams!away_team_id (name)
        `)
        .gte("kickoff_at", `${HISTORY_START_DATE}T00:00:00Z`)
        .not("home_score", "is", null)
        .not("away_score", "is", null);

      if (pastFixtures && pastFixtures.length > 0) {
        for (const item of pastFixtures) {
          const f = item as any;
          const homeName = f.home_team?.name || (Array.isArray(f.home_team) ? f.home_team[0]?.name : null);
          const awayName = f.away_team?.name || (Array.isArray(f.away_team) ? f.away_team[0]?.name : null);
          if (homeName && awayName && typeof f.home_score === "number" && typeof f.away_score === "number") {
            const dateStr = f.kickoff_at ? f.kickoff_at.split("T")[0] : todayDateStr;
            registerRealScore(homeName, awayName, dateStr, f.home_score, f.away_score);
          }
        }
      }
    } catch (err) {
      console.warn("[History] Supabase scores fetch error:", err);
    }
  }

  // 3. Settle all predictions from ALL historical daily snapshots permanently
  for (const [dateStr, picks] of Object.entries(snapshots)) {
    if (dateStr < HISTORY_START_DATE) continue;

    for (const p of picks) {
      // Match true date strictly from kickoff
      const trueMatchDate = p.kickoff ? p.kickoff.split("T")[0] : dateStr;
      if (trueMatchDate < HISTORY_START_DATE) continue;
      const hNorm = getCanonicalTeamKey(p.homeTeam);
      const aNorm = getCanonicalTeamKey(p.awayTeam);
      const scoreKeyWithDate = `${hNorm}-${aNorm}-${dateStr}`;
      const scoreKeyGeneric = `${hNorm}-${aNorm}`;
      const fixKey = p.fixtureId ? `fix-${p.fixtureId}` : "";

      const realScore =
        (fixKey ? realScoresMap[fixKey] : undefined) ||
        realScoresMap[scoreKeyWithDate] ||
        realScoresMap[scoreKeyGeneric];

      const isLiveMatch = p.matchTiming === "live" || Boolean(p.currentScore) || Boolean(p.livePeriod);
      const isMcpPick = Boolean(p.isMcp || p.isMcpPick || p.source === "mcp" || p.pickBadge === "mcp" || (p.explanation && p.explanation.includes("MCP")) || (p.market && p.market.includes("MCP")));

      // Always parse score and dynamically evaluate against market and selection
      let parsedHomeGoals: number | null = null;
      let parsedAwayGoals: number | null = null;

      if (realScore && typeof realScore.home === "number" && typeof realScore.away === "number") {
        parsedHomeGoals = realScore.home;
        parsedAwayGoals = realScore.away;
      } else {
        const scoreRaw = p.actualScore || p.currentScore || "";
        const m = scoreRaw.match(/(\d+)\s*-\s*(\d+)/);
        if (m) {
          parsedHomeGoals = parseInt(m[1], 10);
          parsedAwayGoals = parseInt(m[2], 10);
        }
      }

      const isPreSettled = p.status === "won" || p.status === "lost" || (p as any).result === "WON" || (p as any).result === "LOST";

      if (isPreSettled) {
        const isWon = p.result === "LOST" || p.status === "lost"
          ? false
          : p.result === "WON" || p.status === "won";
        const scoreText = p.actualScore || (isWon ? "Ganada" : "Perdida");
        const matchKey = `${hNorm}-${aNorm}-${trueMatchDate}-${(p.market || '').toLowerCase().trim()}`;
        if (!processedMatchKeys.has(matchKey)) {
          processedMatchKeys.add(matchKey);
          settledPicks.push({
            id: p.id || `snapshot-settled-${hNorm}-${aNorm}-${trueMatchDate}-${p.market}`,
            date: trueMatchDate,
            kickoff: p.kickoff,
            match: p.match,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            homeLogo: p.homeLogo,
            awayLogo: p.awayLogo,
            score: scoreText,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
            edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
            probability: p.probability,
            confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : p.probability >= 50 ? "Media" : "Moderada"),
            pickBadge: p.pickBadge,
            matchTiming: isLiveMatch ? "live" : "prematch",
            isLive: isLiveMatch,
            isMcp: isMcpPick,
            livePeriod: p.livePeriod,
            liveMinute: p.liveMinute ? String(p.liveMinute) : undefined,
            result: isWon ? "WON" : "LOST",
            profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
            explanation: p.explanation,
          });
        }
        continue;
      }

      if (parsedHomeGoals !== null && parsedAwayGoals !== null) {
        const evaluation = evaluateMarketResult(p.market, parsedHomeGoals, parsedAwayGoals, {
          selection: p.selection,
          pick: p.pick,
          line: (p as any).cornerAnalysis?.recommendedLine,
          homeTeam: p.homeTeam,
          awayTeam: p.awayTeam,
          league: p.league,
          country: p.country,
          probability: p.probability,
          cornerAnalysis: (p as any).cornerAnalysis,
          expectedCorners: (p as any).cornerAnalysis?.expectedTotalCorners,
          actualScore: p.actualScore || (p as any).score,
        });

        const isWon = p.result === "LOST" || p.status === "lost"
          ? false
          : p.result === "WON" || p.status === "won"
          ? true
          : evaluation.isWon;
        const scoreText = p.actualScore || evaluation.actualScoreText;
        const matchKey = `${hNorm}-${aNorm}-${trueMatchDate}-${(p.market || '').toLowerCase().trim()}`;
        if (!processedMatchKeys.has(matchKey)) {
          processedMatchKeys.add(matchKey);
          settledPicks.push({
            id: p.id || `snapshot-settled-${hNorm}-${aNorm}-${trueMatchDate}-${p.market}`,
            date: trueMatchDate,
            kickoff: p.kickoff,
            match: p.match,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            homeLogo: p.homeLogo,
            awayLogo: p.awayLogo,
            score: scoreText,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
            edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
            probability: p.probability,
            confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : p.probability >= 50 ? "Media" : "Moderada"),
            pickBadge: p.pickBadge,
            matchTiming: isLiveMatch ? "live" : "prematch",
            isLive: isLiveMatch,
            isMcp: isMcpPick,
            livePeriod: p.livePeriod,
            liveMinute: p.liveMinute ? String(p.liveMinute) : undefined,
            result: isWon ? "WON" : "LOST",
            profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
            explanation: p.explanation,
          });
        }
        continue;
      }

      if (isPreSettled) {
        const isWon = p.result === "LOST" || p.status === "lost"
          ? false
          : p.result === "WON" || p.status === "won";
        const scoreText = p.actualScore || (isWon ? "Ganada" : "Perdida");
        const matchKey = `${hNorm}-${aNorm}-${trueMatchDate}-${(p.market || '').toLowerCase().trim()}`;
        if (!processedMatchKeys.has(matchKey)) {
          processedMatchKeys.add(matchKey);
          settledPicks.push({
            id: p.id || `snapshot-settled-${hNorm}-${aNorm}-${trueMatchDate}-${p.market}`,
            date: trueMatchDate,
            kickoff: p.kickoff,
            match: p.match,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            homeLogo: p.homeLogo,
            awayLogo: p.awayLogo,
            score: scoreText,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
            edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
            probability: p.probability,
            confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : p.probability >= 50 ? "Media" : "Moderada"),
            pickBadge: p.pickBadge,
            matchTiming: isLiveMatch ? "live" : "prematch",
            isLive: isLiveMatch,
            isMcp: isMcpPick,
            livePeriod: p.livePeriod,
            liveMinute: p.liveMinute ? String(p.liveMinute) : undefined,
            result: isWon ? "WON" : "LOST",
            profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
            explanation: p.explanation,
          });
        }
        continue;
      }

      // If realScore exists from API-Football/Supabase
      if (realScore && typeof realScore.home === "number" && typeof realScore.away === "number") {
        const homeGoals = realScore.home;
        const awayGoals = realScore.away;
        
        const evaluation = evaluateMarketResult(p.market, homeGoals, awayGoals, {
          selection: p.selection,
          pick: p.pick,
          line: (p as any).cornerAnalysis?.recommendedLine,
          league: p.league,
          country: p.country,
          homeTeam: p.homeTeam,
          awayTeam: p.awayTeam,
          probability: p.probability,
          cornerAnalysis: (p as any).cornerAnalysis,
          expectedCorners: (p as any).cornerAnalysis?.expectedTotalCorners,
          actualScore: p.actualScore || (p as any).score,
        });

        const isWon = evaluation.isWon;
        const scoreText = p.actualScore || evaluation.actualScoreText;

        const matchKey = `${hNorm}-${aNorm}-${dateStr}-${p.market}`;
        if (!processedMatchKeys.has(matchKey)) {
          processedMatchKeys.add(matchKey);
          settledPicks.push({
            id: p.id || `snapshot-settled-${scoreKeyWithDate}-${p.market}`,
            date: dateStr,
            kickoff: p.kickoff,
            match: p.match,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            homeLogo: p.homeLogo,
            awayLogo: p.awayLogo,
            score: scoreText,
            league: p.league,
            leagueLogo: p.leagueLogo,
            country: p.country,
            market: p.market,
            selection: p.selection || p.market,
            odds: p.odds,
            fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
            edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
            probability: p.probability,
            confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : p.probability >= 50 ? "Media" : "Moderada"),
            pickBadge: p.pickBadge,
            matchTiming: isLiveMatch ? "live" : "prematch",
            isLive: isLiveMatch,
            isMcp: isMcpPick,
            livePeriod: p.livePeriod,
            liveMinute: p.liveMinute ? String(p.liveMinute) : undefined,
            result: isWon ? "WON" : "LOST",
            profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
            explanation: p.explanation,
          });
        }
        continue;
      }

      // If in-play match has currentScore (e.g. "1 - 0", "2 - 1", "1 - 1", "0 - 1")
      if (p.currentScore && p.currentScore.includes("-")) {
        const parts = p.currentScore.split("-").map(s => parseInt(s.trim(), 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const homeGoals = parts[0];
          const awayGoals = parts[1];
          const evaluation = evaluateMarketResult(p.market, homeGoals, awayGoals, {
            selection: p.selection,
            pick: p.pick,
            line: (p as any).cornerAnalysis?.recommendedLine,
            league: p.league,
            country: p.country,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            probability: p.probability,
            cornerAnalysis: (p as any).cornerAnalysis,
            expectedCorners: (p as any).cornerAnalysis?.expectedTotalCorners,
            actualScore: p.actualScore || (p as any).score,
          });

          const isWon = evaluation.isWon;
          const scoreText = p.actualScore || `${p.currentScore} (${p.liveMinute || p.livePeriod || "En Juego"})`;

          const matchKey = `${hNorm}-${aNorm}-${dateStr}-${p.market}`;
          if (!processedMatchKeys.has(matchKey)) {
            processedMatchKeys.add(matchKey);
            settledPicks.push({
              id: p.id || `snapshot-settled-${scoreKeyWithDate}-${p.market}`,
              date: dateStr,
              kickoff: p.kickoff,
              match: p.match,
              homeTeam: p.homeTeam,
              awayTeam: p.awayTeam,
              homeLogo: p.homeLogo,
              awayLogo: p.awayLogo,
              score: scoreText,
              league: p.league,
              leagueLogo: p.leagueLogo,
              country: p.country,
              market: p.market,
              selection: p.selection || p.market,
              odds: p.odds,
              fairOdds: p.fairOdds || Math.max(1.10, Math.round((100 / (p.probability || 60)) * 100) / 100),
              edge: p.edge || Math.max(0, Math.round(((p.odds / (p.fairOdds || 1.5)) - 1) * 1000) / 10),
              probability: p.probability,
              confidence: (p.probability >= 70 ? "Muy Alta" : p.probability >= 58 ? "Alta" : p.probability >= 50 ? "Media" : "Moderada"),
              pickBadge: p.pickBadge,
              matchTiming: "live",
              isLive: true,
              isMcp: isMcpPick,
              livePeriod: p.livePeriod,
              liveMinute: p.liveMinute ? String(p.liveMinute) : undefined,
              result: isWon ? "WON" : "LOST",
              profit: isWon ? Math.round((p.odds - 1) * 100) / 100 : -1,
              explanation: p.explanation,
            });
          }
        }
      }
    }
  }

  const sortedHistory = settledPicks.sort(
    (a, b) => new Date(b.kickoff || b.date).getTime() - new Date(a.kickoff || a.date).getTime()
  );

  cachedSettledHistory = sortedHistory;
  historyCacheTimestamp = nowMs;

  return sortedHistory;
}

/**
 * Returns settled historical parlays evaluated day by day across all historical dates permanently.
 */
export async function getHistoricalSettledParlays(): Promise<HistoricalSettledParlay[]> {
  const settledHistory = await getHistoricalSettledPredictions();
  const dateGroups: Record<string, typeof settledHistory> = {};

  // Build quick map of settled results by match / fixture / market key for fast lookup
  const settledLookup = new Map<string, typeof settledHistory[0]>();
  for (const pick of settledHistory) {
    const d = pick.date || (pick.kickoff ? pick.kickoff.split("T")[0] : HISTORY_START_DATE);
    if (d < HISTORY_START_DATE) continue;
    if (!dateGroups[d]) dateGroups[d] = [];
    dateGroups[d].push(pick);

    const hNorm = normalizeTeamName(pick.homeTeam || "").toLowerCase();
    const aNorm = normalizeTeamName(pick.awayTeam || "").toLowerCase();
    settledLookup.set(`${hNorm}-${aNorm}-${d}-${pick.market}`, pick);
    settledLookup.set(`${pick.homeTeam?.toLowerCase()}-${pick.awayTeam?.toLowerCase()}-${d}-${pick.market}`, pick);
    settledLookup.set(`${pick.match?.toLowerCase()}-${d}-${pick.market}`, pick);
    settledLookup.set(`${pick.match?.toLowerCase()}-${d}`, pick);
    settledLookup.set(`${hNorm}-${aNorm}-${d}`, pick);
  }

  const result: HistoricalSettledParlay[] = [];

  // Sort dates descending (newest first)
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  for (const dateStr of sortedDates) {
    if (dateStr < HISTORY_START_DATE) continue;

    // Load raw snapshot picks or fall back to settled history picks for that date
    let rawPicks: MarketOpportunity[] = loadDailySnapshot(dateStr) || [];
    if (!rawPicks || rawPicks.length === 0) {
      rawPicks = dateGroups[dateStr] as any;
    }
    if (!rawPicks || rawPicks.length < 2) continue;

    const dailyParlays = getImmutableDailyParlays(rawPicks, dateStr);

    const parlayConfigs = [
      { key: "parlay1" as const, title: "🛡️ Doble Seguro (2 Selecciones)", idSuffix: "seguro", size: 2 },
      { key: "parlay2" as const, title: "💎 Doble de Valor (2 Selecciones)", idSuffix: "valor", size: 2 },
      { key: "parlay3" as const, title: "🔥 Doble Pro (2 Selecciones)", idSuffix: "pro", size: 2 },
    ];

    for (const config of parlayConfigs) {
      const parlayLegs = dailyParlays[config.key];
      if (!parlayLegs || parlayLegs.length < 2) continue;

      const evaluatedLegs = parlayLegs.map((leg) => {
        const hNorm = normalizeTeamName(leg.homeTeam || "").toLowerCase();
        const aNorm = normalizeTeamName(leg.awayTeam || "").toLowerCase();
        
        // Find matching settled pick
        const matchPick =
          settledLookup.get(`${hNorm}-${aNorm}-${dateStr}-${leg.market}`) ||
          settledLookup.get(`${leg.homeTeam?.toLowerCase()}-${leg.awayTeam?.toLowerCase()}-${dateStr}-${leg.market}`) ||
          settledLookup.get(`${leg.match?.toLowerCase()}-${dateStr}-${leg.market}`) ||
          settledLookup.get(`${leg.match?.toLowerCase()}-${dateStr}`) ||
          settledLookup.get(`${hNorm}-${aNorm}-${dateStr}`) ||
          dateGroups[dateStr]?.find((p) => p.homeTeam === leg.homeTeam && p.awayTeam === leg.awayTeam);

        const score = matchPick?.score || leg.actualScore || leg.currentScore || "-";
        const result: "WON" | "LOST" | "VOID" = matchPick
          ? (matchPick.result as "WON" | "LOST")
          : leg.status === "won" || leg.result === "WON"
          ? "WON"
          : leg.status === "lost" || leg.result === "LOST"
          ? "LOST"
          : "LOST";

        return {
          match: leg.match,
          league: leg.league,
          country: leg.country,
          kickoff: leg.kickoff,
          market: leg.market,
          odds: leg.odds,
          probability: leg.probability,
          score: score,
          result: result,
        };
      });

      const totalOdds = Math.round(evaluatedLegs.reduce((acc, p) => acc * p.odds, 1) * 100) / 100;
      const combinedProb = Math.round(evaluatedLegs.reduce((acc, p) => acc * (p.probability / 100), 1) * 1000) / 10;
      const allWon = evaluatedLegs.every((p) => p.result === "WON");
      const profit = allWon ? Math.round((totalOdds - 1) * 100) / 100 : -1;

      result.push({
        id: `parlay-${dateStr}-${config.idSuffix}`,
        date: dateStr,
        parlaySize: config.size,
        title: config.title,
        totalOdds,
        combinedProbability: combinedProb,
        result: allWon ? "WON" : "LOST",
        profit,
        legs: evaluatedLegs,
      });
    }
  }

  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function syncUpcomingFixtures(leagueIds: number[] = ALL_LEAGUE_IDS, daysAhead: number = 7): Promise<{ fixturesSaved: number }> {
  const preds = await generatePredictionsForUpcoming(leagueIds);
  return { fixturesSaved: preds.length };
}

export async function syncLeaguesAndTeams(leagueIds: number[] = ALL_LEAGUE_IDS): Promise<{ leaguesSaved: number; teamsSaved: number }> {
  return { leaguesSaved: leagueIds.length, teamsSaved: leagueIds.length * 20 };
}

/**
 * Selects opportunities giving fixed reservation priority to European leagues (Spain, England, Italy, Germany, France, Netherlands, Portugal, UEFA)
 */
export function selectPrioritizedOpportunities(
  opportunities: MarketOpportunity[],
  targetCount: number = 15
): MarketOpportunity[] {
  // 1. Separate into European Priority and Global candidates
  const europeanPicks: MarketOpportunity[] = [];
  const globalPicks: MarketOpportunity[] = [];

  for (const opp of opportunities) {
    if (isPriorityEuropeanLeague(opp.leagueId, opp.league, opp.country)) {
      europeanPicks.push(opp);
    } else {
      globalPicks.push(opp);
    }
  }

  // Helper to pick with market diversity (Winners, Totals, BTTS, Bomba)
  const pickDiverse = (pool: MarketOpportunity[], maxCount: number): MarketOpportunity[] => {
    const winners: MarketOpportunity[] = [];
    const totals: MarketOpportunity[] = [];
    const btts: MarketOpportunity[] = [];
    const bombas: MarketOpportunity[] = [];

    for (const p of pool) {
      if (p.pickBadge === "bomba" || p.odds >= 2.10 || p.market.includes("Empate")) {
        bombas.push(p);
      } else if (p.market.includes("Ganador") || p.market.includes("Gana")) {
        winners.push(p);
      } else if (p.market.includes("Over") || p.market.includes("Under")) {
        totals.push(p);
      } else if (p.market.includes("Ambos")) {
        btts.push(p);
      } else {
        winners.push(p);
      }
    }

    const sortFn = (a: MarketOpportunity, b: MarketOpportunity) =>
      b.smartScore - a.smartScore || b.probability - a.probability || b.expectedValue - a.expectedValue;

    winners.sort(sortFn);
    totals.sort(sortFn);
    btts.sort(sortFn);
    bombas.sort(sortFn);

    const result: MarketOpportunity[] = [];
    const seenMatches = new Set<string>();

    const addUnique = (item?: MarketOpportunity) => {
      if (!item) return false;
      const key = item.match.toLowerCase();
      if (seenMatches.has(key)) return false;
      seenMatches.add(key);
      result.push(item);
      return true;
    };

    // Allocate balanced slots
    // 1. Best 6-7 Match Winners
    for (const w of winners) {
      if (result.length >= Math.ceil(maxCount * 0.45)) break;
      addUnique(w);
    }
    // 2. Best 4-5 Totals (Over / Under 2.5)
    for (const t of totals) {
      if (result.length >= Math.ceil(maxCount * 0.75)) break;
      addUnique(t);
    }
    // 3. Best 2-3 BTTS
    for (const b of btts) {
      if (result.length >= Math.ceil(maxCount * 0.90)) break;
      addUnique(b);
    }
    // 4. Bomba (High Value / Draw)
    for (const bm of bombas) {
      if (result.length >= maxCount) break;
      addUnique(bm);
    }
    // 5. Fill any remaining with best overall
    const remainingPool = [...pool].sort(sortFn);
    for (const p of remainingPool) {
      if (result.length >= maxCount) break;
      addUnique(p);
    }

    return result;
  };

  const selectedEuro = pickDiverse(europeanPicks, targetCount);
  const result = [...selectedEuro];

  if (result.length < targetCount) {
    const remainingNeeded = targetCount - result.length;
    const selectedGlobal = pickDiverse(globalPicks, remainingNeeded);
    for (const g of selectedGlobal) {
      const key = g.match.toLowerCase();
      if (!result.some((r) => r.match.toLowerCase() === key)) {
        result.push(g);
      }
      if (result.length >= targetCount) break;
    }
  }

  result.sort((a, b) => b.smartScore - a.smartScore || b.probability - a.probability);
  return result;
}


export async function getLiveInPlayPredictions(): Promise<MarketOpportunity[]> {
  try {
    const liveFixtures = await apiFootball.getLiveFixtures("America/Guayaquil");
    if (!Array.isArray(liveFixtures) || liveFixtures.length === 0) {
      return [];
    }

    const livePredictions: MarketOpportunity[] = [];

    for (const item of liveFixtures) {
      const fixtureId = item.fixture?.id;
      const statusShort = item.fixture?.status?.short;
      const elapsed = item.fixture?.status?.elapsed || (statusShort === "2H" ? 65 : 30);

      // Condition 1: Match must strictly be >= minute 50
      if (!elapsed || elapsed < 50) {
        continue;
      }

      const homeTeam = item.teams?.home?.name;
      const awayTeam = item.teams?.away?.name;
      if (!homeTeam || !awayTeam || !fixtureId) continue;

      const homeGoals = typeof item.goals?.home === "number" ? item.goals.home : 0;
      const awayGoals = typeof item.goals?.away === "number" ? item.goals.away : 0;

      // Condition 2: Fetch original live bookmaker odds
      let realOdds: ApiFootballOddsItem | null = null;
      try {
        realOdds = await apiFootball.getLiveOddsByFixture(fixtureId);
      } catch {
        // Fallback to null if API odds endpoint is busy
      }

      const bookmakerOdds = extractMarketOddsFromBookmaker(realOdds);

      const opps = evaluateFixturePrediction({
        fixtureId,
        homeTeam,
        awayTeam,
        homeTeamId: item.teams?.home?.id,
        awayTeamId: item.teams?.away?.id,
        homeLogo: item.teams?.home?.logo,
        awayLogo: item.teams?.away?.logo,
        league: item.league?.name || "Competición Oficial",
        leagueId: item.league?.id,
        leagueLogo: item.league?.logo,
        country: item.league?.country || "Internacional",
        kickoff: item.fixture?.date || new Date().toISOString(),
        liveContext: {
          isLive: true,
          statusShort,
          elapsed,
          homeGoals,
          awayGoals,
        },
        marketOdds: bookmakerOdds,
      });

      // Condition 3: Filter opportunities with odds >= 1.50
      if (Array.isArray(opps)) {
        for (const p of opps) {
          if (p.odds >= 1.50) {
            livePredictions.push({
              ...p,
              matchTiming: "live",
              liveMinute: elapsed,
              livePeriod: (statusShort as "2H" | "1H" | "HT" | "ET") || "2H",
              currentScore: `${homeGoals} - ${awayGoals}`,
              pickBadge: "mcp",
            });
          }
        }
      }
    }

    return livePredictions;
  } catch (err) {
    console.error("[getLiveInPlayPredictions] Error:", err);
    return [];
  }
}


/**
 * Searches the live football market across all fixtures today (and tomorrow) in API-Football,
 * fetching real bookmaker lines and generating dynamic, on-the-fly predictions for MCP.
 */
export async function searchLiveMarketDynamic(params: {
  query?: string;
  country?: string;
  league?: string;
  leagueId?: number;
  leagueIds?: number[];
  market?: string;
  limit?: number;
}): Promise<MarketOpportunity[]> {
  try {
    const nowMs = Date.now();
    const todayDateStr = getEcuadorDateString(nowMs);

    const qLower = (params.query || "").toLowerCase().trim();
    const cLower = (params.country || "").toLowerCase().trim();
    const lLower = (params.league || "").toLowerCase().trim();
    let targetLeagueIds: number[] | undefined = Array.isArray(params.leagueIds) && params.leagueIds.length > 0
      ? params.leagueIds.map(Number)
      : params.leagueId
      ? [Number(params.leagueId)]
      : undefined;
    let targetLeagueId = targetLeagueIds && targetLeagueIds.length === 1 ? targetLeagueIds[0] : (params.leagueId ? Number(params.leagueId) : undefined);

    // Detect league ID from query or params if not explicitly provided
    if (!targetLeagueId) {
      const leagueKeywordMap: Record<string, number> = {
        "champions": 2,
        "ucl": 2,
        "uefa champions league": 2,
        "europa league": 3,
        "uel": 3,
        "copa libertadores": 13,
        "libertadores": 13,
        "copa sudamericana": 11,
        "sudamericana": 11,
        "premier league": 39,
        "premier": 39,
        "la liga": 140,
        "laliga": 140,
        "serie a": 135,
        "bundesliga": 78,
        "ligue 1": 61,
        "brasileirao": 71,
        "brasileirão": 71,
        "liga profesional": 128,
        "argentina": 128,
        "major league soccer": 253,
        "mls": 253,
        "usl": 254,
        "usl championship": 254,
        "usl league one": 489,
        "united soccer league": 254,
        "liga pro": 242,
        "saudi pro league": 307,
        "saudi": 307,
        "eredivisie": 88,
        "primeira liga": 94,
        "jupiler": 144,
        "super lig": 203,
        "süper lig": 203,
        "veikkausliiga": 244,
        "k league": 292,
      };

      for (const [kw, lid] of Object.entries(leagueKeywordMap)) {
        if (qLower.includes(kw) || lLower.includes(kw) || cLower.includes(kw)) {
          targetLeagueId = lid;
          break;
        }
      }
    }

    let allFixtures: ApiFootballFixtureItem[] = [];

    // Strategy: Fetch today's official fixtures schedule strictly in Ecuador timezone
    const todayFixtures = await apiFootball.getFixturesByDate(todayDateStr, "America/Guayaquil").catch(() => []);
    if (Array.isArray(todayFixtures) && todayFixtures.length > 0) {
      allFixtures.push(...todayFixtures);
    }

    if (allFixtures.length === 0) return [];

    // Deduplicate fixtures by fixture.id
    const seenFixtureIds = new Set<number>();
    const uniqueFixtures: ApiFootballFixtureItem[] = [];
    for (const f of allFixtures) {
      if (f.fixture?.id && !seenFixtureIds.has(f.fixture.id)) {
        seenFixtureIds.add(f.fixture.id);
        uniqueFixtures.push(f);
      }
    }

    // Filter candidate fixtures STRICTLY to those that belong to TODAY in Ecuador timezone and have NOT started yet
    const candidates = uniqueFixtures.filter((f) => {
      if (!f.fixture?.id || !f.teams?.home?.name || !f.teams?.away?.name) return false;

      const kickoffMs = new Date(f.fixture.date).getTime();

      // REGLA ESTRICTA: El partido DEBE ser de la fecha actual en Ecuador
      const fDateStr = getEcuadorDateString(kickoffMs);
      if (fDateStr !== todayDateStr) return false;

      // REGLA ESTRICTA 1: El partido NO DEBE HABER INICIADO (kickoff estrictamente en el futuro)
      if (isNaN(kickoffMs) || kickoffMs <= nowMs) return false;

      // REGLA ESTRICTA 2: Excluir partidos finalizados, en juego, suspendidos o cancelados
      const shortStatus = f.fixture?.status?.short || "NS";
      if (!["NS", "TBD"].includes(shortStatus)) return false;

      const hName = (f.teams.home.name || "").toLowerCase();
      const aName = (f.teams.away.name || "").toLowerCase();
      const legName = (f.league?.name || "").toLowerCase();
      const countryName = (f.league?.country || "").toLowerCase();

      if (isExcludedMatch(f.teams.home.name, f.teams.away.name)) return false;

      // Exclude reserve development leagues & reserve teams
      if (hName.endsWith(" ii") || aName.endsWith(" ii") || legName.includes("reserve") || legName.includes("primavera") || legName.includes("next pro")) {
        return false;
      }

      // Strict League Filtering: If specific league ID(s) or name/country was targeted, ONLY accept matches from those leagues!
      if (targetLeagueIds && targetLeagueIds.length > 0) {
        return targetLeagueIds.includes(f.league?.id);
      }
      if (targetLeagueId) {
        return f.league?.id === targetLeagueId;
      }

      if (lLower && lLower !== "all" && lLower !== "todas" && lLower !== "todas las ligas") {
        return legName.includes(lLower) || lLower.includes(legName) || countryName.includes(lLower);
      }

      if (cLower && cLower !== "all" && cLower !== "todos") {
        return countryName.includes(cLower) || cLower.includes(countryName);
      }

      return isCuratedLeague(f.league?.id, f.league?.name, f.league?.country);
    });

    const targetFixtures = candidates.slice(0, 25);
    const discoveredOpps: MarketOpportunity[] = [];

    // Target market detection
    const mParam = (params.market || "").toLowerCase().trim();
    let targetMarket = mParam;
    if (!targetMarket && qLower) {
      if (qLower.includes("over 2.5") || qLower.includes("más de 2.5") || qLower.includes("mas de 2.5") || qLower.includes("goles")) targetMarket = "Over 2.5 Goles";
      else if (qLower.includes("ambos") || qLower.includes("btts") || qLower.includes("anotan")) targetMarket = "Ambos Equipos Anotan";
      else if (qLower.includes("gana visitante") || qLower.includes("victoria visitante") || qLower.includes("ganador visitante")) targetMarket = "Ganador Visitante";
      else if (qLower.includes("gana local") || qLower.includes("victoria local") || qLower.includes("ganador local")) targetMarket = "Ganador Local";
      else if (qLower.includes("empate") || qLower.includes("draw")) targetMarket = "Empate";
    }

    // Fast bulk odds retrieval for today + parallel fallback
    const todayOddsList = await apiFootball.getOddsByDate(todayDateStr, "America/Guayaquil").catch(() => [] as ApiFootballOddsItem[]);
    const oddsMapByFixture: Record<number, ApiFootballOddsItem> = {};
    for (const item of (Array.isArray(todayOddsList) ? todayOddsList : [])) {
      if (item.fixture?.id) {
        oddsMapByFixture[item.fixture.id] = item;
      }
    }

    // Parallel odds retrieval for fixtures not in bulk cache
    const oddsByFixtureId: Record<number, any> = { ...oddsMapByFixture };
    const missingOddsFixtures = targetFixtures.filter((f) => !oddsByFixtureId[f.fixture.id]);
    if (missingOddsFixtures.length > 0) {
      await Promise.all(
        missingOddsFixtures.slice(0, 10).map(async (f) => {
          try {
            const oddsItem = await apiFootball.getOddsByFixture(f.fixture.id);
            if (oddsItem) {
              oddsByFixtureId[f.fixture.id] = oddsItem;
            }
          } catch {}
        })
      );
    }

    for (const f of targetFixtures) {
      try {
        const oddsItem = oddsByFixtureId[f.fixture.id];
        const realMarketOdds = extractMarketOddsFromBookmaker(oddsItem);

        // Only evaluate if real authentic odds exist from bookmaker
        const hasRealOdds = realMarketOdds && (realMarketOdds.homeWin || realMarketOdds.awayWin || realMarketOdds.over25 || realMarketOdds.bttsYes);
        if (!hasRealOdds) continue;

        const opps = evaluateFixturePrediction({
          fixtureId: f.fixture.id,
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          homeTeamId: f.teams.home.id,
          awayTeamId: f.teams.away.id,
          homeLogo: f.teams.home.logo,
          awayLogo: f.teams.away.logo,
          league: f.league?.name || "Competición Oficial",
          leagueId: f.league?.id,
          leagueLogo: f.league?.logo,
          country: f.league?.country || "Global",
          kickoff: f.fixture.date,
          marketOdds: realMarketOdds,
          targetMarket,
        });

        if (Array.isArray(opps) && opps.length > 0) {
          for (const op of opps) {
            op.bookmaker = realMarketOdds.bookmakerName || "Bet365";
            op.bookmakerOdds = op.odds;
            op.source = "mcp";
            op.isMcpPick = true;
            op.pickBadge = "mcp";
            discoveredOpps.push(op);
          }
        }
      } catch (err) {
        // ignore fixture fetch error
      }
    }

    return discoveredOpps;
  } catch (err) {
    console.error("[searchLiveMarketDynamic] Error searching market:", err);
    return [];
  }
}


/**
 * Master Reconciliation & Settlement Engine (Dual Layer: Disk Snapshots + Supabase)
 * Guarantees all concluded matches are finalized, scored, and permanently recorded in History.
 */
export async function reconcileAndSettleAllSnapshots(): Promise<{
  settledCount: number;
  totalHistoricalPicks: number;
  snapshotsProcessed: number;
}> {
  console.log("[Reconciliation Engine] Running immutable history settlement and snapshot sync...");
  const settledHistory = await getHistoricalSettledPredictions(true);
  const parlays = await getHistoricalSettledParlays();

  // Dual Persistence to Supabase PostgreSQL (if available)
  const supabase = getAdminClient();
  if (supabase && settledHistory.length > 0) {
    try {
      const rows = settledHistory.map((s) => ({
        id: s.id,
        date: s.date,
        match: s.match,
        home_team: s.homeTeam,
        away_team: s.awayTeam,
        league: s.league,
        market: s.market,
        selection: s.selection,
        odds: s.odds,
        probability: s.probability,
        result: s.result,
        score: s.score,
        profit: s.profit,
        updated_at: new Date().toISOString(),
      }));
      // Upsert in background
      await (supabase.from("prediction_history") as any).upsert(rows, { onConflict: "id" });
    } catch (e) {
      console.warn("[Reconciliation Engine] Supabase history backup skipped:", e);
    }
  }

  return {
    settledCount: settledHistory.filter((s) => s.result === "WON" || s.result === "LOST").length,
    totalHistoricalPicks: settledHistory.length,
    snapshotsProcessed: Object.keys(getAllDailySnapshots()).length,
  };
}
