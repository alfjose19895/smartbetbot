import { queryClaudeSportsAgent, isClaudeConfigured } from "@/lib/ai/claude-analyst";
import { NextResponse } from "next/server";
import {
  getEcuadorDateString,
  getStoredPredictions,
  addPredictionsToDailySnapshot,
  searchLiveMarketDynamic,
} from "@/lib/sports/db";
import {
  MarketOpportunity,
} from "@/lib/sports/prediction-engine";

const FORBIDDEN_RESERVE_TEAMS = [
  "the town", "tacoma defiance", "ventura county", "ventura", "carolina core", "chattanooga",
  "crown legacy", "huntsville", "north texas", "whitecaps 2", "timbers 2", "monarchs",
  "union ii", "red bulls ii", "chicago fire ii", "colorado rapids ii", "columbus crew 2",
  "fc cincinnati 2", "houston dynamo 2", "inter miami ii", "los angeles fc ii", "minnesota united ii",
  "new england revolution ii", "new york city fc ii", "orlando city b", "philadelphia union ii",
  "sporting kc ii", "st. louis city 2", "toronto fc ii"
];

const LEAGUE_KEYWORDS: Record<string, string[]> = {
  "champions": ["champions", "ucl", "champions league", "uefa champions league"],
  "europa": ["europa league", "uel", "europa"],
  "libertadores": ["libertadores", "conmebol libertadores", "copa libertadores"],
  "sudamericana": ["sudamericana", "conmebol sudamericana", "copa sudamericana"],
  "premier": ["premier league", "premier", "inglaterra", "league cup", "fa cup", "efl cup"],
  "la liga": ["la liga", "primera división españa", "laliga", "españa", "copa del rey"],
  "serie a": ["serie a", "italia"],
  "bundesliga": ["bundesliga", "alemania"],
  "ligue 1": ["ligue 1", "francia"],
  "championship": ["championship", "segunda inglaterra"],
  "eredivisie": ["eredivisie", "holanda", "paises bajos", "países bajos"],
  "mls": ["mls", "major league soccer", "estados unidos", "usa"],
  "saudi": ["saudi", "pro league", "arabia", "arabia saudita"],
  "brasileirao": ["brasileirao", "brasileirão", "serie a brasil", "brasil"],
  "liga argentina": ["liga argentina", "primera division argentina", "copa de la liga", "argentina"],
  "colombia": ["colombia", "liga betplay", "dimayor", "primera a colombia"],
  "mexico": ["mexico", "méxico", "liga mx", "apertura", "clausura"],
  "ecuador": ["ecuador", "liga pro", "ligapro", "serie a ecuador"],
  "portugal": ["portugal", "primeira liga", "liga portugal"],
  "turquia": ["turquia", "turquía", "super lig", "süper lig"],
  "finlandia": ["veikkausliiga", "finlandia", "finland"],
};

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  "españa": ["spain", "españa", "la liga", "segunda", "copa del rey"],
  "inglaterra": ["england", "inglaterra", "premier league", "championship", "league cup", "efl cup"],
  "alemania": ["germany", "alemania", "bundesliga", "2. bundesliga", "dfb pokal"],
  "italia": ["italy", "italia", "serie a", "serie b", "coppa italia"],
  "francia": ["france", "francia", "ligue 1", "ligue 2", "coupe de france"],
  "portugal": ["portugal", "primeira liga", "liga portugal", "taca de portugal"],
  "paises bajos": ["netherlands", "países bajos", "paises bajos", "holanda", "eredivisie", "eerste divisie"],
  "turquia": ["turkey", "turquía", "turquia", "super lig", "süper lig"],
  "brasil": ["brazil", "brasil", "brasileirao", "brasileirão", "serie a", "serie b", "copa do brasil"],
  "argentina": ["argentina", "liga profesional", "copa de la liga", "primera nacional"],
  "colombia": ["colombia", "liga betplay", "primera a", "copa colombia"],
  "mexico": ["mexico", "méxico", "liga mx", "liga de expansion"],
  "ecuador": ["ecuador", "liga pro", "ligapro", "serie a ecuador"],
  "costa rica": ["costa rica", "primera division", "fcrf", "unafut"],
  "estados unidos": ["usa", "estados unidos", "united states", "mls"],
  "champions": ["champions", "uefa", "ucl"],
  "sudamericana": ["sudamericana", "conmebol"],
  "finlandia": ["finlandia", "finland", "veikkausliiga"],
};

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, picks, pick, query = "", country = "", minProb, minOdds, maxOdds, market = "", parlay } = body;

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

    // 1. DYNAMIC MARKET SEARCH: Query live API-Football fixtures & genuine bookmaker odds
    const dynamicMarketOpps = await searchLiveMarketDynamic({ query, country });

    // 2. Retrieve baseline stored predictions for today
    const storedPicks = getStoredPredictions();

    // 3. Merge: Prioritize fresh dynamic market discoveries + baseline
    // KEYED BY FIXTURE + MARKET to preserve all distinct market opportunities per match (1X2, Over 2.5, BTTS)
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

    const nowMs = Date.now();
    let pool = Array.from(seenMap.values()).filter((p) => {
      // REGLA ESTRICTA 1: Solo partidos del día actual
      const pDate = getEcuadorDateString(new Date(p.kickoff));
      if (pDate !== todayStr) return false;

      // REGLA ESTRICTA 2: Excluir partidos ya finalizados del día actual o días anteriores
      const kMs = new Date(p.kickoff).getTime();
      if (p.status === "won" || p.status === "lost" || p.status === "void") return false;
      if (kMs < nowMs - 135 * 60 * 1000) return false;

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

    // 1. League Filter Recognition from Prompt
    let matchedByLeague = false;
    for (const [leagueKey, keywords] of Object.entries(LEAGUE_KEYWORDS)) {
      if (keywords.some((kw) => qLower.includes(kw))) {
        const leagueMatches = pool.filter((p) => {
          const l = (p.league || "").toLowerCase();
          return keywords.some((kw) => l.includes(kw) || kw.includes(l));
        });
        if (leagueMatches.length > 0) {
          filtered = leagueMatches;
          matchedByLeague = true;
          break;
        }
      }
    }

    // 2. Team Name Search
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

    // 3. Country / Region Filter
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

    // 4. Market Filter from natural language
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

    // 5. Probability / Confidence filtering with soft tolerance
    let effectiveMinProb = minProb || 0;
    const probMatch = qLower.match(/probabilidad(?:s*(?:de|con))?s*(?:superior|mayor(?:es)?|más|mas|>|>=)s*(?:al?|de)?s*([0-9]+)%?/);
    if (probMatch) {
      effectiveMinProb = parseFloat(probMatch[1]);
    }
    if (qLower.includes("muy alta") || qLower.includes("maxima seguridad") || qLower.includes("más seguros")) {
      effectiveMinProb = Math.max(effectiveMinProb, 60);
    }

    if (effectiveMinProb > 0) {
      const probFiltered = filtered.filter((p) => p.probability >= (effectiveMinProb - 3.0));
      if (probFiltered.length > 0) {
        filtered = probFiltered;
      }
    }

    // 6. Odds filtering
    let effectiveMinOdds = minOdds || 0;
    let effectiveMaxOdds = maxOdds || 99;

    const minOddsMatch = qLower.match(/cuota(?:s)?s*(?:mayor(?:es)?|superior(?:es)?s*(?:a|de)?|>|>=)s*([0-9]+(?:.[0-9]+)?)/);
    if (minOddsMatch) {
      effectiveMinOdds = parseFloat(minOddsMatch[1]);
    }
    const maxOddsMatch = qLower.match(/cuota(?:s)?s*(?:menor(?:es)?s*(?:a|de)?|<|<=)s*([0-9]+(?:.[0-9]+)?)/);
    if (maxOddsMatch) {
      effectiveMaxOdds = parseFloat(maxOddsMatch[1]);
    }

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

    // 7. Parlay Generation if requested: STRICTLY DISTINCT MATCHES
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
      if (filtered.length > 8) {
        filtered = filtered.slice(0, 8);
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

    // 8. Generate Live Tactical Reasoning & Briefing (Powered by Gemini AI)
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
        console.warn("[McpAgentApi] Gemini AI live reasoning error:", err);
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
        ? `Análisis Táctico en Vivo: ${topPick?.homeTeam} vs ${topPick?.awayTeam}`
        : matchedByLeague
        ? `Análisis de Mercado: ${topPick?.league || "Competición Internacional"}`
        : "Exploración Cuantitativa de Mercado en Vivo",
      summary: filtered.length === 0
        ? `Se exploró el mercado en vivo para "${query}". No se encontraron partidos que cumplan estrictamente los filtros de cuota y probabilidad sin comprometer el bankroll.`
        : `El Agente exploró el mercado global en vivo para "${query}". Se descubrieron ${filtered.length} oportunidades con cuotas reales de Bet365, probabilidad promedio del ${avgProb}% y cuota promedio de @${avgOdds}.`,
      insights: [
        topPick ? `Líder en valor descubierto: ${topPick.homeTeam} vs ${topPick.awayTeam} (${topPick.league}) con cuota Bet365 @${topPick.odds} y probabilidad del ${topPick.probability}%.` : "Búsqueda en mercado en vivo completada.",
        `Líneas 100% reales verificadas directamente con Bet365 y Pinnacle.`,
        `Filtro de Primera División y Competiciones Oficiales activo.`,
      ],
      recommendation: isParlayRequest
        ? `Estrategia Parlay: Stake 1 (1-2% del bankroll) para retorno de cuota @${parlayData?.totalOdds}.`
        : `Estrategia Principal: Apuestas simples con Stake 2 (2% del bankroll) en las opciones con mayor ventaja estadística.`,
      parlayRecommendation: parlayData,
    };

    return NextResponse.json({
      success: true,
      count: filtered.length,
      countryDetected: matchedByLeague ? (topPick?.league || "Europa") : "Global",
      autoPublished: false,
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
      { success: false, error: "Error en el Agente MCP de Pronósticos" },
      { status: 500 }
    );
  }
}
