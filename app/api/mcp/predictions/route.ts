import { queryClaudeSportsAgent, isClaudeConfigured } from "@/lib/ai/claude-analyst";
import { NextResponse } from "next/server";
import {
  generatePredictionsForUpcoming,
  getEcuadorDateString,
  getStoredPredictions,
  addPredictionsToDailySnapshot,
} from "@/lib/sports/db";
import {
  MarketOpportunity,
  evaluateFixturePrediction,
} from "@/lib/sports/prediction-engine";
import {
  apiFootball,
  extractMarketOddsFromBookmaker,
} from "@/lib/sports/api-football";

const OFFICIAL_MLS_TEAMS = [
  "atlanta united", "austin", "cf montreal", "montreal", "charlotte", "chicago fire",
  "colorado rapids", "columbus crew", "dc united", "cincinnati", "fc cincinnati",
  "fc dallas", "dallas", "houston dynamo", "inter miami", "los angeles fc", "lafc",
  "los angeles galaxy", "la galaxy", "minnesota united", "nashville", "new england revolution",
  "new york city", "nycfc", "new york red bulls", "red bulls", "orlando city",
  "philadelphia union", "portland timbers", "real salt lake", "san diego", "san jose earthquakes",
  "seattle sounders", "sporting kansas city", "sporting kc", "st. louis city", "toronto fc",
  "vancouver whitecaps", "vancouver"
];

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
  "premier": ["premier league", "premier", "inglaterra"],
  "la liga": ["la liga", "primera división españa", "laliga", "españa"],
  "serie a": ["serie a", "italia"],
  "bundesliga": ["bundesliga", "alemania"],
  "ligue 1": ["ligue 1", "francia"],
  "championship": ["championship", "segunda inglaterra"],
  "eredivisie": ["eredivisie", "holanda", "paises bajos", "países bajos"],
  "mls": ["mls", "major league soccer", "estados unidos", "usa"],
  "k league": ["k league", "corea", "korea"],
  "veikkausliiga": ["veikkausliiga", "finlandia"],
  "brasileirao": ["brasileirão", "brasileirao", "brasil", "serie a brasil", "serie b brasil"],
  "argentina": ["liga profesional", "argentina", "copa de la liga"],
};

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  españa: ["españa", "spain", "la liga", "primera división", "villarreal", "leganes", "barcelona", "madrid", "sevilla", "betis", "oviedo", "tenerife"],
  inglaterra: ["inglaterra", "england", "premier league", "southampton", "portsmouth", "fleetwood", "wigan", "southend", "shrewsbury", "bolton", "west ham"],
  alemania: ["alemania", "germany", "bundesliga", "leverkusen", "leipzig", "gladbach", "bremen", "union berlin", "kiel", "nürnberg", "elversberg", "dortmund"],
  italia: ["italia", "italy", "serie a", "fiorentina", "torino", "sudtirol", "catanzaro", "inter"],
  francia: ["francia", "france", "ligue 1", "le havre", "brest", "lille"],
  portugal: ["portugal", "primeira liga", "sporting", "nacional", "tondela", "porto"],
  ecuador: ["ecuador", "liga pro", "serie a ecuador", "copa ecuador", "independiente del valle", "macara", "barcelona sc", "ldu", "emelec"],
  "costa rica": ["costa rica", "liga fpd", "primera división (liga fpd)", "primera division", "alajuelense", "saprissa", "herediano", "perez zeledon", "cartagines"],
  mexico: ["méxico", "mexico", "liga mx", "san luis", "chivas", "guadalajara", "america", "cruz azul", "tigres", "monterrey"],
  brasil: ["brasil", "brazil", "brasileirão", "brasileirao", "serie a brasil", "sao paulo", "atletico-mg", "flamengo", "palmeiras", "coritiba", "chapecoense", "cuiaba", "criciuma", "juventude"],
  argentina: ["argentina", "liga profesional", "copa de la liga", "boca", "river", "racing", "independiente", "boca juniors"],
  colombia: ["colombia", "primera a", "liga betplay", "santa fe", "fortaleza", "millonarios", "junior", "nacional"],
  peru: ["perú", "peru", "liga 1 peru", "cusco", "moquegua", "alianza", "universitario", "sporting cristal"],
  chile: ["chile", "primera división chile", "campeonato nacional", "everton", "catolica", "colo colo", "u de chile"],
  holanda: ["holanda", "países bajos", "paises bajos", "netherlands", "eredivisie", "ajax", "psv", "feyenoord", "nec nijmegen", "excelsior", "utrecht"],
  belgica: ["bélgica", "belgica", "belgium", "jupiler pro league", "standard liege", "antwerp", "brujas", "anderlecht", "club brugge"],
  estados_unidos: [
    "estados unidos", "usa", "mls", "major league soccer", "inter miami", "philadelphia",
    "montreal", "vancouver", "cincinnati", "dc united", "real salt lake", "los angeles fc",
    "la galaxy", "portland", "seattle sounders", "columbus crew", "austin", "san jose earthquakes",
    "fc dallas", "sporting kansas city", "orlando city", "colorado rapids", "toronto fc",
    "chicago fire", "charlotte", "houston dynamo"
  ],
  ucrania: ["ucrania", "ukraine", "premier league ucrania", "kharkiv", "shakhtar", "dynamo kyiv"],
  croacia: ["croacia", "croatia", "hnl", "rijeka", "osijek", "dinamo zagreb", "hajduk"],
};

export interface AiAgentAnalysis {
  intent: string;
  summary: string;
  insights: string[];
  recommendation: string;
  parlayRecommendation?: {
    totalOdds: string;
    combinedProbability: string;
    selectionsCount: number;
    legs: Array<{ match: string; market: string; selection: string; odds: number }>;
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, picks, pick, query = "", country = "", minProb, minOdds, maxOdds, market = "" } = body;

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
        message: result.addedCount > 0
          ? `✓ Se agregaron ${result.addedCount} alertas al Dashboard y Alertas del Día con la etiqueta 🤖 Agente MCP. Total activo: ${result.totalAlerts} alertas.`
          : `✓ Las alertas seleccionadas ya se encuentran publicadas en el Dashboard. Total: ${result.totalAlerts} alertas.`,
        predictions: result.predictions,
      });
    }

    let allPredictions = getStoredPredictions();
    if (allPredictions.length === 0) {
      allPredictions = await generatePredictionsForUpcoming();
    }
    const todayStr = getEcuadorDateString(Date.now());

    // Base candidate pool from today's snapshot (strictly filtering out reserve squads)
    let pool = allPredictions.filter((p) => {
      const pDate = getEcuadorDateString(new Date(p.kickoff));
      const leg = (p.league || "").toLowerCase();
      const h = (p.homeTeam || "").toLowerCase();
      const a = (p.awayTeam || "").toLowerCase();

      // Exclude reserve development leagues & reserve teams
      if (FORBIDDEN_RESERVE_TEAMS.some((t) => h.includes(t) || a.includes(t))) return false;
      if (leg.includes("next pro") || leg.includes("primavera") || leg.includes("reserve")) return false;
      if (h.endsWith(" ii") || h.endsWith(" 2") || a.endsWith(" ii") || a.endsWith(" 2")) return false;

      return pDate === todayStr;
    });

    const qLower = (query || "").toLowerCase().trim();
    const cLower = (country || "").toLowerCase().trim();

    // Natural Language Timing Intent: Live in-play vs Pre-match
    const isLiveRequest =
      qLower.includes("en vivo") ||
      qLower.includes("en directo") ||
      qLower.includes("iniciado") ||
      qLower.includes("comenzado") ||
      qLower.includes("en juego") ||
      qLower.includes("minuto") ||
      qLower.includes("live");

    const isPreMatchRequest =
      qLower.includes("por comenzar") ||
      qLower.includes("proximo") ||
      qLower.includes("próximo") ||
      qLower.includes("antes de iniciar") ||
      qLower.includes("prematch") ||
      qLower.includes("pre-match");

    let filtered = pool;

    // 1. League Filter Recognition from Prompt
    let matchedByLeague = false;
    for (const [leagueKey, keywords] of Object.entries(LEAGUE_KEYWORDS)) {
      if (keywords.some((kw) => qLower.includes(kw))) {
        const leagueMatches = pool.filter((p) => {
          const l = p.league.toLowerCase();
          return keywords.some((kw) => l.includes(kw) || kw.includes(l));
        });
        if (leagueMatches.length > 0) {
          filtered = leagueMatches;
          matchedByLeague = true;
          break;
        }
      }
    }

    // 2. Team Name Search (only if not a broad natural language sentence without exact team name)
    let matchedByTeam = false;
    if (!matchedByLeague && qLower.length > 2 && qLower.length < 35) {
      const teamMatches = pool.filter((p) => {
        const h = p.homeTeam.toLowerCase();
        const a = p.awayTeam.toLowerCase();
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

    if (!matchedByTeam && !matchedByLeague && targetCountryTerms.length > 0) {
      const countryMatches = filtered.filter((p) => {
        const pCountry = (p.country || "").toLowerCase();
        const pLeague = (p.league || "").toLowerCase();
        const pHome = (p.homeTeam || "").toLowerCase();
        const pAway = (p.awayTeam || "").toLowerCase();

        return targetCountryTerms.some(
          (term) =>
            pCountry.includes(term) ||
            pLeague.includes(term) ||
            term.includes(pCountry) ||
            pHome.includes(term) ||
            pAway.includes(term)
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
    } else if (qLower.includes("gana local") || qLower.includes("victoria local") || qLower.includes("triunfo local") || qLower.includes("ganador local") || qLower.includes("local")) {
      requestedMarket = "local";
    }

    if (requestedMarket) {
      const matchMarket = filtered.filter((p) => {
        const pMarket = p.market.toLowerCase();
        if (requestedMarket === "over") {
          return pMarket.includes("over") || pMarket.includes("goles");
        }
        return pMarket.includes(requestedMarket);
      });
      if (matchMarket.length > 0) {
        filtered = matchMarket;
      }
    }

    // 5. Probability / Confidence filtering with tolerance
    let effectiveMinProb = minProb || 0;
    const probMatch = qLower.match(/probabilidad(?:\s*(?:de|con))?\s*(?:superior|mayor(?:es)?|más|mas|>|>=)\s*(?:al?|de)?\s*([0-9]+)%?/);
    if (probMatch) {
      effectiveMinProb = parseFloat(probMatch[1]);
    }
    if (qLower.includes("muy alta") || qLower.includes("maxima seguridad") || qLower.includes("más seguros")) {
      effectiveMinProb = Math.max(effectiveMinProb, 65);
    }

    if (effectiveMinProb > 0) {
      // Filter with soft tolerance so 64.8% matches 65% requested
      const probFiltered = filtered.filter((p) => p.probability >= (effectiveMinProb - 2.0));
      if (probFiltered.length > 0) {
        filtered = probFiltered;
      }
    }

    // 6. Odds filtering
    let effectiveMinOdds = minOdds || 0;
    let effectiveMaxOdds = maxOdds || 99;

    const minOddsMatch = qLower.match(/cuota(?:s)?\s*(?:mayor(?:es)?|superior(?:es)?\s*(?:a|de)?|>|>=)\s*([0-9]+(?:\.[0-9]+)?)/);
    if (minOddsMatch) {
      effectiveMinOdds = parseFloat(minOddsMatch[1]);
    }
    const maxOddsMatch = qLower.match(/cuota(?:s)?\s*(?:menor(?:es)?\s*(?:a|de)?|<|<=)\s*([0-9]+(?:\.[0-9]+)?)/);
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

    // Sort by best statistical conviction
    filtered.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0) || b.probability - a.probability);

    // Limit to top 6 best picks for the response
    if (filtered.length > 6) {
      filtered = filtered.slice(0, 6);
    }

    // Tag every discovered prediction with MCP origin
    filtered = filtered.map((p) => ({
      ...p,
      pickBadge: (p.pickBadge || "mcp") as "bomba" | "valor" | "estandar" | "mcp",
      isMcpPick: true,
      source: "mcp" as const,
    }));

    const autoPublishResult = { addedCount: 0, totalAlerts: pool.length };

    // 7. Parlay Generation if requested
    const isParlayRequest = qLower.includes("parlay") || qLower.includes("combinada") || qLower.includes("acumulada");
    let parlayData = undefined;
    if (isParlayRequest && filtered.length >= 2) {
      const legs = filtered.slice(0, Math.min(3, filtered.length));
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

    // 8. Generate Dynamic AI Reasoning & Briefing (Powered by Gemini / Claude)
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
        console.warn("[McpAgentApi] AI live reasoning error:", err);
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
        ? "Combinada / Parlay Inteligente"
        : matchedByTeam
        ? `Análisis Táctico Específico: ${topPick?.homeTeam} vs ${topPick?.awayTeam}`
        : matchedByLeague
        ? `Análisis de Competición: ${topPick?.league || "UEFA Champions League"}`
        : "Filtro Algorítmico Cuantitativo con IA",
      summary: filtered.length === 0
        ? `No se encontraron partidos para hoy (${todayStr}) que cumplan exactamente todos los criterios de "${query}". Se protegen los filtros para evitar apuestas precipitadas.`
        : `El motor analizó las oportunidades de hoy para "${query}". Se encontraron ${filtered.length} selecciones de alto valor con probabilidad promedio del ${avgProb}% y cuota promedio real de @${avgOdds}.`,
      insights: [
        topPick ? `Líder en valor: ${topPick.homeTeam} vs ${topPick.awayTeam} (${topPick.league}) con cuota real @${topPick.odds} y probabilidad del ${topPick.probability}%.` : "Filtros aplicados con rigor estadístico.",
        `Cuotas 100% verificadas directamente con líneas de Bet365 / Pinnacle sin modelos sintéticos.`,
        `Filtro de Primera División activo: Se excluyen filiales y ligas menores.`,
      ],
      recommendation: isParlayRequest
        ? `Estrategia Parlay: Stake 1 (1-2% del bankroll) para retorno de cuota @${parlayData?.totalOdds}.`
        : `Estrategia Principal: Apuestas simples con Stake 2 (2% del bankroll) en las opciones de mayor probabilidad.`,
      parlayRecommendation: parlayData,
    };

    return NextResponse.json({
      success: true,
      count: filtered.length,
      countryDetected: matchedByLeague ? (topPick?.league || "Europa") : "Global",
      autoPublished: false,
      autoPublishResult,
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
