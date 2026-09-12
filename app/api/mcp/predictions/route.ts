"use server";

import { NextResponse } from "next/server";
import {
  searchLiveMarketDynamic,
  getStoredPredictions,
  generatePredictionsForUpcoming,
  addPredictionsToDailySnapshot,
  getEcuadorDateString,
} from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { queryClaudeSportsAgent, isClaudeConfigured } from "@/lib/ai/claude-analyst";

interface AiAgentAnalysis {
  intent: string;
  summary: string;
  insights: string[];
  recommendation: string;
  parlayRecommendation?: {
    totalOdds: string;
    combinedProbability: string;
    selectionsCount: number;
    legs: {
      match: string;
      market: string;
      selection: string;
      odds: number;
    }[];
  };
}

const FORBIDDEN_RESERVE_TEAMS = [
  "the town fc",
  "tacoma defiance",
  "austin fc ii",
  "chicago fire ii",
  "colorado rapids 2",
  "columbus crew 2",
  "crown legacy",
  "fc cincinnati 2",
  "houston dynamo 2",
  "huntsville city",
  "inter miami ii",
  "los angeles fc 2",
  "minnesota united 2",
  "new england revolution ii",
  "new york city fc ii",
  "new york red bulls ii",
  "north texas sc",
  "orlando city b",
  "philadelphia union ii",
  "portland timbers 2",
  "real monarchs",
  "san jose earthquakes ii",
  "sporting kansas city ii",
  "st. louis city 2",
  "toronto fc ii",
  "vancouver whitecaps 2",
  "ventura county",
  "chattanooga fc",
  "carolina core",
];

const LEAGUE_KEYWORDS: Record<string, string[]> = {
  champions: ["champions", "ucl", "uefa champions league", "champions league", "uefa"],
  europa: ["europa league", "uel", "uefa europa league", "europa"],
  sudamericana: ["sudamericana", "conmebol sudamericana", "copa sudamericana", "sudamerica"],
  libertadores: ["libertadores", "conmebol libertadores", "copa libertadores"],
  premier: ["premier", "inglaterra", "league cup", "efl cup", "fa cup"],
  laliga: ["la liga", "laliga", "españa", "copa del rey"],
  seriea: ["serie a", "italia", "coppa italia"],
  bundesliga: ["bundesliga", "alemania", "dfb pokal"],
  ligue1: ["ligue 1", "francia", "coupe de france"],
  saudi: ["saudi", "pro league", "arabia"],
  brasil: ["brasileirao", "brasileirão", "brasil", "copa do brasil"],
  argentina: ["argentina", "liga profesional", "copa argentina"],
  finland: ["veikkausliiga", "finlandia"],
  korea: ["k league", "corea"],
};

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  espana: ["espana", "españa", "spain", "la liga", "laliga", "copa del rey"],
  inglaterra: ["inglaterra", "england", "premier league", "championship", "fa cup", "league cup", "efl"],
  italia: ["italia", "italy", "serie a", "serie b", "coppa italia"],
  alemania: ["alemania", "germany", "bundesliga", "dfb pokal"],
  francia: ["francia", "france", "ligue 1", "ligue 2", "coupe de france"],
  brasil: ["brasil", "brazil", "brasileirao", "brasileirão", "copa do brasil", "serie a"],
  argentina: ["argentina", "liga profesional", "copa argentina", "primera division"],
  colombia: ["colombia", "primera a", "copa colombia", "liga betplay"],
  ecuador: ["ecuador", "liga pro", "copa ecuador", "serie a"],
  mexico: ["mexico", "méxico", "liga mx", "copa mx", "expansion mx"],
  portugal: ["portugal", "primeira liga", "taca de portugal", "segunda liga"],
  paises_bajos: ["paises bajos", "países bajos", "netherlands", "holanda", "eredivisie", "knvb beker"],
  turquia: ["turquia", "turquía", "turkey", "super lig", "süper lig", "turkiye kupasi"],
  belgica: ["belgica", "bélgica", "belgium", "jupiler pro league", "challenger pro league"],
  arabia: ["arabia", "arabia saudita", "saudi arabia", "saudi", "pro league", "king cup"],
  usa: ["usa", "estados unidos", "united states", "major league soccer", "mls", "us open cup"],
  japon: ["japon", "japón", "japan", "j1 league", "j2 league", "emperor cup"],
  corea: ["corea", "south korea", "k league 1", "k league 2", "fa cup"],
  finlandia: ["finlandia", "finland", "veikkausliiga", "suomen cup"],
  champions: ["champions", "ucl", "uefa champions league", "europa", "europe", "world"],
  europa: ["europa", "uel", "uefa europa league", "europe", "world"],
  libertadores: ["libertadores", "conmebol libertadores", "sudamerica", "south america", "world"],
  sudamericana: ["sudamericana", "conmebol sudamericana", "sudamerica", "south america", "world"],
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      action,
      picks,
      pick,
      query = "",
      country = "",
      league = "",
      leagueId,
      targetLeagueId: bodyTargetLeagueId,
      minProb,
      minOdds,
      maxOdds,
      market = "",
      parlay,
      autoPublish,
      publish,
    } = body;

    // Direct publish action: Add MCP-discovered alerts to active daily dashboard and signals
    if (action === "publish" || action === "addPicks") {
      const picksToPublish = Array.isArray(picks) ? picks : pick ? [pick] : [];
      const taggedPicks = picksToPublish
        .filter((p) => {
          const h = (p.homeTeam || "").toLowerCase();
          const a = (p.awayTeam || "").toLowerCase();
          const l = (p.league || "").toLowerCase();
          if (FORBIDDEN_RESERVE_TEAMS.some((t) => h.includes(t) || a.includes(t))) return false;
          if (l.includes("next pro") || l.includes("reserve") || h.endsWith(" ii") || a.endsWith(" ii")) return false;
          return true;
        })
        .map((p) => ({
          ...p,
          pickBadge: (p.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
          isMcpPick: true,
          source: "mcp" as const,
        }));

      const result = addPredictionsToDailySnapshot(taggedPicks);
      return NextResponse.json({
        success: true,
        addedCount: result.addedCount,
        totalAlerts: result.totalAlerts,
        parlay: parlay || null,
        message: result.addedCount > 0
          ? `✓ Se agregaron ${result.addedCount} pronósticos con éxito al Dashboard y la Sección Parlay con la etiqueta 🤖 Agente MCP.`
          : `Los pronósticos seleccionados ya se encontraban registrados en el Dashboard. Total activo: ${result.totalAlerts} alertas.`,
        predictions: result.predictions,
      });
    }

    const todayStr = getEcuadorDateString(Date.now());
    const qLower = (query || "").toLowerCase().trim();
    const cLower = (country || "").toLowerCase().trim();
    const lLower = (league || "").toLowerCase().trim();
    const targetLeagueId = Number(bodyTargetLeagueId || leagueId) || undefined;

    // Detect target market before search
    const mLower = (market || "").toLowerCase().trim();
    let requestedMarket = "";
    if (mLower) {
      requestedMarket = mLower;
    } else if (qLower.includes("ambos marcan") || qLower.includes("ambos anotan") || qLower.includes("btts") || qLower.includes("ambos")) {
      requestedMarket = "ambos";
    } else if (qLower.includes("over 2.5") || qLower.includes("más de 2.5") || qLower.includes("mas de 2.5") || qLower.includes("over") || qLower.includes("goles")) {
      requestedMarket = "over";
    } else if (qLower.includes("gana visitante") || qLower.includes("victoria visitante") || qLower.includes("ganador visitante")) {
      requestedMarket = "visitante";
    } else if (
      qLower.includes("ganador local") ||
      qLower.includes("gana local") ||
      qLower.includes("victoria local") ||
      qLower.includes("triunfo local") ||
      (qLower.includes("local") && !qLower.includes("visitante"))
    ) {
      requestedMarket = "local";
    } else if (qLower.includes("empate") || qLower.includes("draw")) {
      requestedMarket = "empate";
    } 

    // 1. DYNAMIC MARKET SEARCH: Query live API-Football upcoming fixtures & genuine bookmaker odds
    const dynamicMarketOpps = await searchLiveMarketDynamic({
      query,
      country,
      league,
      leagueId: targetLeagueId,
      market: requestedMarket || market,
    });

    // 2. If targetLeagueId is provided and dynamic search returned fixtures, use dynamic discoveries exclusively!
    let pool: MarketOpportunity[] = [];

    if (targetLeagueId && dynamicMarketOpps.length > 0) {
      pool = dynamicMarketOpps;
    } else {
      // Merge dynamic discoveries + baseline stored predictions
      const storedPicks = getStoredPredictions();
      const seenMap = new Map<string, MarketOpportunity>();

      for (const p of dynamicMarketOpps) {
        const fixId = p.fixtureId || 0;
        const key = `${fixId}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
        seenMap.set(key, p);
      }
      for (const p of storedPicks) {
        const fixId = p.fixtureId || 0;
        const key = `${fixId}-${p.homeTeam}-${p.awayTeam}-${p.market}`;
        if (!seenMap.has(key)) {
          seenMap.set(key, p);
        }
      }
      pool = Array.from(seenMap.values());
    }

    const nowMs = Date.now();
    pool = pool.filter((p) => {
      // REGLA ESTRICTA 1: Solo partidos que NO hayan iniciado aún (kickoff estrictamente en el futuro)
      const kMs = new Date(p.kickoff).getTime();
      if (isNaN(kMs) || kMs <= nowMs) return false;

      // REGLA ESTRICTA 2: Excluir totalmente jugadas finalizadas o en juego
      if (
        p.status === "won" ||
        p.status === "lost" ||
        p.status === "void" ||
        (p.status as string) === "WON" ||
        (p.status as string) === "LOST" ||
        (p as any).result === "WON" ||
        (p as any).result === "LOST"
      ) {
        return false;
      }
      if (p.actualScore || p.currentScore || p.matchTiming === "live" || p.livePeriod || p.liveMinute) {
        return false;
      }

      const h = (p.homeTeam || "").toLowerCase();
      const a = (p.awayTeam || "").toLowerCase();
      const leg = (p.league || "").toLowerCase();

      // Exclude reserve development leagues & reserve teams
      if (FORBIDDEN_RESERVE_TEAMS.some((t) => h.includes(t) || a.includes(t))) return false;
      if (leg.includes("next pro") || leg.includes("primavera") || leg.includes("reserve")) return false;
      if (h.endsWith(" ii") || h.endsWith(" 2") || a.endsWith(" ii") || a.endsWith(" 2")) return false;

      return true;
    });

    let filtered = pool;

    // 1. Direct League Filter Recognition (Exact ID or League Name)
    let matchedByLeague = false;

    if (targetLeagueId) {
      const idMatches = pool.filter((p) => p.leagueId === targetLeagueId);
      if (idMatches.length > 0) {
        filtered = idMatches;
        matchedByLeague = true;
      }
    }

    if (!matchedByLeague && lLower && lLower !== "all" && lLower !== "todas" && lLower !== "todas las ligas") {
      const nameMatches = pool.filter((p) => {
        const pLeague = (p.league || "").toLowerCase();
        const pCountry = (p.country || "").toLowerCase();
        return pLeague.includes(lLower) || lLower.includes(pLeague) || pCountry.includes(lLower);
      });
      if (nameMatches.length > 0) {
        filtered = nameMatches;
        matchedByLeague = true;
      }
    }

    // 2. NLP League Filter Recognition from Prompt or Country Parameter
    if (!matchedByLeague) {
      for (const [leagueKey, keywords] of Object.entries(LEAGUE_KEYWORDS)) {
        if (keywords.some((kw) => qLower.includes(kw) || cLower.includes(kw) || kw === cLower)) {
          const leagueMatches = pool.filter((p) => {
            const l = (p.league || "").toLowerCase();
            const c = (p.country || "").toLowerCase();
            return keywords.some((kw) => l.includes(kw) || kw.includes(l) || c.includes(kw));
          });
          if (leagueMatches.length > 0) {
            filtered = leagueMatches;
            matchedByLeague = true;
            break;
          }
        }
      }
    }

    // 3. Team Name Search
    let matchedByTeam = false;
    if (!matchedByLeague && qLower.length > 2) {
      const teamMatches = pool.filter((p) => {
        const h = (p.homeTeam || "").toLowerCase();
        const a = (p.awayTeam || "").toLowerCase();
        return (
          qLower.includes(h) ||
          h.includes(qLower) ||
          qLower.includes(a) ||
          a.includes(qLower)
        );
      });

      if (teamMatches.length > 0) {
        filtered = teamMatches;
        matchedByTeam = true;
      }
    }

    // 4. Country / Region Filter
    let targetCountryTerms: string[] = [];
    if (cLower) {
      targetCountryTerms = COUNTRY_SYNONYMS[cLower] || [cLower];
    } else if (!matchedByLeague && !matchedByTeam) {
      for (const [countryKey, synonyms] of Object.entries(COUNTRY_SYNONYMS)) {
        if (synonyms.some((syn) => qLower.includes(syn))) {
          targetCountryTerms = synonyms;
          break;
        }
      }
    }

    if (targetCountryTerms.length > 0) {
      const countryMatches = pool.filter((p) => {
        const pCountry = (p.country || "").toLowerCase();
        const pLeague = (p.league || "").toLowerCase();
        return targetCountryTerms.some(
          (term) =>
            pCountry.includes(term) ||
            term.includes(pCountry) ||
            pLeague.includes(term) ||
            term.includes(pLeague)
        );
      });
      if (countryMatches.length > 0) {
        filtered = countryMatches;
      }
    }

    // 5. Market Filter from natural language
    if (requestedMarket) {
      const matchMarket = filtered.filter((p) => {
        const pMarket = (p.market || "").toLowerCase();
        
        if (requestedMarket === "over") {
          return pMarket.includes("over") || pMarket.includes("goles") || pMarket.includes("más");
        }
        if (requestedMarket === "local") {
          return pMarket.includes("local") || pMarket.includes("gana local") || pMarket.includes("ganador local");
        }
        if (requestedMarket === "visitante") {
          return pMarket.includes("visitante") || pMarket.includes("gana visitante") || pMarket.includes("ganador visitante");
        }
        if (requestedMarket === "ambos") {
          return pMarket.includes("ambos") || pMarket.includes("btts") || pMarket.includes("anotan");
        }
        return pMarket.includes(requestedMarket);
      });
      if (matchMarket.length > 0) {
        filtered = matchMarket;
      }
    }

    // 6. Probability / Confidence filtering
    let effectiveMinProb = minProb || 0;
    if (qLower.includes("muy alta") || qLower.includes("maxima seguridad") || qLower.includes("más seguros")) {
      effectiveMinProb = Math.max(effectiveMinProb, 60);
    }
    if (effectiveMinProb > 0) {
      const probFiltered = filtered.filter((p) => p.probability >= (effectiveMinProb - 3.0));
      if (probFiltered.length > 0) {
        filtered = probFiltered;
      }
    }

    // 7. Odds filtering
    let effectiveMinOdds = minOdds || 0;
    let effectiveMaxOdds = maxOdds || 99;

    if (qLower.includes("bomba") || qLower.includes("cuotas altas") || qLower.includes("sorpresa")) {
      effectiveMinOdds = Math.max(effectiveMinOdds, 2.00);
    }

    if (effectiveMinOdds > 0) {
      const oddsFiltered = filtered.filter((p) => p.odds >= effectiveMinOdds);
      if (oddsFiltered.length > 0) filtered = oddsFiltered;
    }
    if (effectiveMaxOdds < 99) {
      const oddsFiltered = filtered.filter((p) => p.odds <= effectiveMaxOdds);
      if (oddsFiltered.length > 0) filtered = oddsFiltered;
    }

    // Sort by best statistical conviction (SmartScore and probability)
    filtered.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0) || b.probability - a.probability);

    // 8. Parlay Generation if requested
    const isParlayRequest = qLower.includes("parlay") || qLower.includes("combinada") || qLower.includes("acumulada");
    let parlayData = undefined;
    if (isParlayRequest) {
      const poolForParlay = filtered.length >= 2 ? filtered : pool;
      const distinctMatchMap = new Map<string, MarketOpportunity>();
      for (const p of poolForParlay) {
        const matchKey = `${p.fixtureId || 0}-${p.homeTeam}-${p.awayTeam}`;
        if (!distinctMatchMap.has(matchKey) && p.probability >= 55) {
          distinctMatchMap.set(matchKey, p);
        }
      }

      const distinctPicks = Array.from(distinctMatchMap.values());
      const legs = distinctPicks.slice(0, Math.min(3, distinctPicks.length));

      if (legs.length >= 2) {
        const totalOdds = legs.reduce((acc, l) => acc * l.odds, 1);
        const combinedProb = legs.reduce((acc, l) => acc * (l.probability / 100), 1) * 100;
        parlayData = {
          totalOdds: totalOdds.toFixed(2),
          combinedProbability: `${combinedProb.toFixed(1)}%`,
          selectionsCount: legs.length,
          legs: legs.map((l) => ({
            match: `${l.homeTeam} vs ${l.awayTeam}`,
            market: l.market,
            selection: l.selection,
            odds: l.odds,
          })),
        };
        filtered = legs;
      }
    } else {
      if (filtered.length > 10) {
        filtered = filtered.slice(0, 10);
      }
    }

    filtered = filtered.map((p) => ({
      ...p,
      bookmaker: p.bookmaker || "Bet365",
      bookmakerOdds: p.bookmakerOdds || p.odds,
      pickBadge: (p.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
      isMcpPick: true,
      source: "mcp" as const,
    }));

    // 9. Generate AI live reasoning safely
    let claudeAgentResult = null;
    if (isClaudeConfigured()) {
      try {
        claudeAgentResult = await queryClaudeSportsAgent({
          query,
          country,
          candidatePicks: filtered.length > 0 ? filtered : pool.slice(0, 6),
          todayDateStr: todayStr,
        });
      } catch (err) {
        console.warn("[McpAgentApi] AI reasoning warning:", err);
      }
    }

    const topPick = filtered[0];
    const avgProb = filtered.length > 0 ? Math.round(filtered.reduce((acc, p) => acc + p.probability, 0) / filtered.length) : 0;
    const avgOdds = filtered.length > 0 ? (filtered.reduce((acc, p) => acc + p.odds, 0) / filtered.length).toFixed(2) : "0.00";

    const aiAnalysis: AiAgentAnalysis = claudeAgentResult ? {
      intent: claudeAgentResult.intent,
      summary: claudeAgentResult.summary,
      insights: [
        ...claudeAgentResult.tacticalInsights,
        ...claudeAgentResult.riskWarnings,
      ],
      recommendation: claudeAgentResult.recommendedStrategy,
      parlayRecommendation: parlayData,
    } : {
      intent: isParlayRequest
        ? "Combinada / Parlay Inteligente de Valor"
        : matchedByTeam
        ? `Análisis Táctico: ${topPick?.homeTeam} vs ${topPick?.awayTeam}`
        : matchedByLeague
        ? `Análisis de Mercado: ${topPick?.league || "Competición Internacional"}`
        : "Exploración Cuantitativa de Mercado en Vivo",
      summary: filtered.length === 0
        ? "No se encontraron partidos pendientes de iniciar para este filtro en las próximas jornadas con cuotas reales de Bet365/Pinnacle."
        : `Se encontraron ${filtered.length} oportunidades con valor matemático positivo (+EV) y cuotas reales de casas de apuestas.`,
      insights: [
        "Filtro estricto: Solo partidos que no han iniciado aún con cuotas 100% reales de Bet365/Pinnacle.",
        "Modelos cuantitativos calibrados con distribución Poisson y ratings Elo oficiales.",
      ],
      recommendation: isParlayRequest
        ? "Jugar combinada conservadora con control de stake (1 - 2 unidades)."
        : "Priorizar selecciones con probabilidad superior al 60% y valor de cuota mayor a @1.50.",
      parlayRecommendation: parlayData,
    };

    // Auto-publish discovered picks if requested or by default on search so they immediately show in Dashboard & Pre-Match
    const shouldAutoPublish = autoPublish === true || publish === true;
    let publishedCount = 0;
    if (shouldAutoPublish && filtered.length > 0) {
      const pubResult = addPredictionsToDailySnapshot(filtered);
      publishedCount = pubResult.addedCount;
    }

    return NextResponse.json({
      success: true,
      count: filtered.length,
      countryDetected: matchedByLeague ? (topPick?.league || "Europa") : "Global",
      autoPublished: shouldAutoPublish,
      publishedCount,
      aiAnalysis,
      metrics: {
        totalMatches: filtered.length,
        averageProbability: `${avgProb}%`,
        averageOdds: `@${avgOdds}`,
        highConfidenceCount: filtered.filter((p) => p.confidence === "Muy Alta" || p.probability >= 60).length,
      },
      predictions: filtered,
    });
  } catch (error) {
    console.error("[McpAgentApi] Error processing prediction search:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error en el Agente MCP de Pronósticos" },
      { status: 500 }
    );
  }
}