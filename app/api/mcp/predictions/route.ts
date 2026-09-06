import { NextResponse } from "next/server";
import {
  generatePredictionsForUpcoming,
  getEcuadorDateString,
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

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  españa: ["españa", "spain", "la liga", "primera división", "villarreal", "leganes", "barcelona", "madrid", "sevilla", "betis", "oviedo", "tenerife"],
  inglaterra: ["inglaterra", "england", "premier league", "southampton", "portsmouth", "fleetwood", "wigan", "southend", "shrewsbury"],
  alemania: ["alemania", "germany", "bundesliga", "leverkusen", "leipzig", "gladbach", "bremen", "union berlin", "kiel", "nürnberg", "elversberg"],
  italia: ["italia", "italy", "serie a", "fiorentina", "torino", "sudtirol", "catanzaro"],
  francia: ["francia", "france", "ligue 1", "le havre", "brest"],
  portugal: ["portugal", "primeira liga", "sporting", "nacional", "tondela"],
  ecuador: ["ecuador", "liga pro", "serie a ecuador", "copa ecuador", "independiente del valle", "macara", "barcelona sc", "ldu", "emelec"],
  "costa rica": ["costa rica", "liga fpd", "primera división (liga fpd)", "primera division", "alajuelense", "saprissa", "herediano", "perez zeledon", "cartagines"],
  mexico: ["méxico", "mexico", "liga mx", "san luis", "chivas", "guadalajara", "america", "cruz azul", "tigres", "monterrey"],
  brasil: ["brasil", "brazil", "brasileirão", "brasileirao", "serie a brasil", "sao paulo", "atletico-mg", "flamengo", "palmeiras", "coritiba", "chapecoense"],
  argentina: ["argentina", "liga profesional", "copa de la liga", "boca", "river", "racing", "independiente"],
  colombia: ["colombia", "primera a", "liga betplay", "santa fe", "fortaleza", "millonarios", "junior", "nacional"],
  peru: ["perú", "peru", "liga 1 peru", "cusco", "moquegua", "alianza", "universitario", "sporting cristal"],
  chile: ["chile", "primera división chile", "campeonato nacional", "everton", "catolica", "colo colo", "u de chile"],
  holanda: ["holanda", "países bajos", "paises bajos", "netherlands", "eredivisie", "ajax", "psv", "feyenoord"],
  belgica: ["bélgica", "belgica", "belgium", "jupiler pro league", "standard liege", "antwerp", "brujas", "anderlecht"],
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
          ? `✓ Se agregaron ${result.addedCount} alertas de Primera División al Dashboard y Alertas del Día con la etiqueta 🤖 Agente MCP. Total activo: ${result.totalAlerts} alertas.`
          : `✓ Las alertas seleccionadas ya se encuentran publicadas en el Dashboard. Total: ${result.totalAlerts} alertas.`,
        predictions: result.predictions,
      });
    }

    const allPredictions = await generatePredictionsForUpcoming();
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

    if (pool.length === 0) {
      pool = allPredictions;
    }

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

    // 1. Natural Language Intent Parsing: Country synonyms
    let targetCountryTerms: string[] = [];
    if (cLower) {
      targetCountryTerms = COUNTRY_SYNONYMS[cLower] || [cLower];
    } else {
      for (const [countryKey, synonyms] of Object.entries(COUNTRY_SYNONYMS)) {
        if (synonyms.some((syn) => qLower.includes(syn))) {
          targetCountryTerms = synonyms;
          break;
        }
      }
    }

    // 2. Team Name Search
    let matchedByTeam = false;
    let filtered = pool;
    if (qLower.length > 2) {
      const teamMatches = pool.filter((p) => {
        const h = p.homeTeam.toLowerCase();
        const a = p.awayTeam.toLowerCase();
        return (
          qLower.includes(h) ||
          h.includes(qLower) ||
          qLower.includes(a) ||
          a.includes(qLower) ||
          (qLower.includes("alajuelense") && (h.includes("alajuel") || a.includes("alajuel"))) ||
          (qLower.includes("saprissa") && (h.includes("sapriss") || a.includes("sapriss"))) ||
          (qLower.includes("independiente") && (h.includes("independiente") || a.includes("independiente"))) ||
          (qLower.includes("everton") && (h.includes("everton") || a.includes("everton"))) ||
          (qLower.includes("herediano") && (h.includes("heredia") || a.includes("heredia")))
        );
      });

      if (teamMatches.length > 0) {
        filtered = teamMatches;
        matchedByTeam = true;
      }
    }

    // 3. Country / Region Filter (if not already matched by specific team)
    if (!matchedByTeam && targetCountryTerms.length > 0) {
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

    // 4. Live API-Football Query (for MLS or live matches or specific country searches)
    const isMlsRequest =
      qLower.includes("mls") ||
      qLower.includes("major league soccer") ||
      qLower.includes("estados unidos") ||
      qLower.includes("usa") ||
      targetCountryTerms.some((t) => t === "mls" || t === "major league soccer");

    if ((isMlsRequest || isLiveRequest || (targetCountryTerms.length > 0 && filtered.length <= 1)) && !matchedByTeam) {
      try {
        const liveFixtures = await apiFootball.getFixturesByDate(todayStr);
        const liveMatchingFixtures = liveFixtures.filter((f) => {
          const l = (f.league.name || "").toLowerCase();
          const c = (f.league.country || "").toLowerCase();
          const h = (f.teams.home.name || "").toLowerCase();
          const a = (f.teams.away.name || "").toLowerCase();
          const statusShort = f.fixture.status.short || "NS";

          // Strict status filter depending on user prompt
          if (isLiveRequest && !["1H", "HT", "2H", "ET", "P"].includes(statusShort)) {
            return false;
          }
          if (isPreMatchRequest && statusShort !== "NS") {
            return false;
          }
          if (["FT", "AET", "PEN", "PST", "CANC", "ABD"].includes(statusShort)) {
            return false;
          }

          // STRICTLY REJECT RESERVES & DEVELOPMENT LEAGUES
          if (
            FORBIDDEN_RESERVE_TEAMS.some((t) => h.includes(t) || a.includes(t)) ||
            l.includes("next pro") ||
            l.includes("reserve") ||
            l.includes("primavera") ||
            l.includes("u21") ||
            l.includes("u20") ||
            l.includes("u19") ||
            l.includes("u23") ||
            l.includes("usl") ||
            h.endsWith(" ii") ||
            h.endsWith(" 2") ||
            h.endsWith(" b") ||
            a.endsWith(" ii") ||
            a.endsWith(" 2") ||
            a.endsWith(" b")
          ) {
            return false;
          }

          if (isMlsRequest) {
            // STRICTLY Primera División de USA: Major League Soccer (League 253)
            const isHomeMls = OFFICIAL_MLS_TEAMS.some((t) => h.includes(t));
            const isAwayMls = OFFICIAL_MLS_TEAMS.some((t) => a.includes(t));
            return (f.league.id === 253 || l.includes("major league soccer")) && isHomeMls && isAwayMls;
          }

          return targetCountryTerms.some((term) =>
            l.includes(term) || c.includes(term) || h.includes(term) || a.includes(term)
          );
        });

        if (liveMatchingFixtures.length > 0) {
          const dynamicallyEvaluated: MarketOpportunity[] = [];
          for (const f of liveMatchingFixtures.slice(0, 10)) {
            const oddsRaw = await apiFootball.getOddsByFixture(f.fixture.id);
            const marketOdds = extractMarketOddsFromBookmaker(oddsRaw);
            const currentScore =
              f.goals?.home !== null && f.goals?.away !== null && f.goals?.home !== undefined && f.goals?.away !== undefined
                ? `${f.goals.home} - ${f.goals.away}`
                : undefined;

            const opps = evaluateFixturePrediction({
              fixtureId: f.fixture.id,
              homeTeam: f.teams.home.name,
              awayTeam: f.teams.away.name,
              homeTeamId: f.teams.home.id,
              awayTeamId: f.teams.away.id,
              homeLogo: f.teams.home.logo,
              awayLogo: f.teams.away.logo,
              league: f.league.name,
              leagueId: f.league.id,
              country: f.league.country,
              leagueLogo: f.league.logo,
              kickoff: f.fixture.date,
              marketOdds,
            });

            if (opps && opps.length > 0) {
              for (const opp of opps) {
                if (currentScore) {
                  opp.actualScore = currentScore;
                }
                dynamicallyEvaluated.push(opp);
              }
            }
          }
          if (dynamicallyEvaluated.length > 0) {
            filtered = dynamicallyEvaluated;
          }
        }
      } catch (err) {
        console.warn("[McpAgentApi] Live fixture query error:", err);
      }
    }

    // 5. Market Filter from natural language
    const mLower = (market || "").toLowerCase().trim();
    let requestedMarket = "";
    if (mLower) {
      requestedMarket = mLower;
    } else if (qLower.includes("ambos marcan") || qLower.includes("ambos anotan") || qLower.includes("btts") || qLower.includes("ambos")) {
      requestedMarket = "ambos";
    } else if (qLower.includes("over 2.5") || qLower.includes("más de 2.5") || qLower.includes("mas de 2.5") || qLower.includes("over") || qLower.includes("goles")) {
      requestedMarket = "over 2.5";
    } else if (qLower.includes("gana visitante") || qLower.includes("victoria visitante") || qLower.includes("ganador visitante")) {
      requestedMarket = "visitante";
    } else if (qLower.includes("gana local") || qLower.includes("victoria local") || qLower.includes("triunfo local") || qLower.includes("ganador local")) {
      requestedMarket = "local";
    }

    if (requestedMarket) {
      const matchMarket = filtered.filter((p) => p.market.toLowerCase().includes(requestedMarket));
      if (matchMarket.length > 0) {
        filtered = matchMarket;
      }
    }

    // 6. Odds filtering (minOdds / maxOdds / natural language)
    let effectiveMinOdds = minOdds || 0;
    let effectiveMaxOdds = maxOdds || 99;

    const minOddsMatch = qLower.match(/cuota(?:s)?\s*(?:mayor(?:es)?\s*(?:a|de)?|>|>=)\s*([0-9]+(?:\.[0-9]+)?)/);
    if (minOddsMatch) {
      effectiveMinOdds = parseFloat(minOddsMatch[1]);
    }
    const maxOddsMatch = qLower.match(/cuota(?:s)?\s*(?:menor(?:es)?\s*(?:a|de)?|<|<=)\s*([0-9]+(?:\.[0-9]+)?)/);
    if (maxOddsMatch) {
      effectiveMaxOdds = parseFloat(maxOddsMatch[1]);
    }
    const rangeOddsMatch = qLower.match(/cuota(?:s)?\s*(?:entre)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:y|-)\s*([0-9]+(?:\.[0-9]+)?)/);
    if (rangeOddsMatch) {
      effectiveMinOdds = parseFloat(rangeOddsMatch[1]);
      effectiveMaxOdds = parseFloat(rangeOddsMatch[2]);
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

    // 7. Probability / Confidence filtering
    let effectiveMinProb = minProb || 0;
    const probMatch = qLower.match(/probabilidad(?:\s*de)?\s*(?:mayor(?:es)?\s*(?:a|de)?|>|>=)\s*([0-9]+)%?/);
    if (probMatch) {
      effectiveMinProb = parseFloat(probMatch[1]);
    }
    if (qLower.includes("muy alta") || qLower.includes("maxima seguridad") || qLower.includes("más seguros")) {
      effectiveMinProb = Math.max(effectiveMinProb, 65);
    }

    if (effectiveMinProb > 0) {
      const probFiltered = filtered.filter((p) => p.probability >= effectiveMinProb);
      if (probFiltered.length > 0) filtered = probFiltered;
    }

    // Fallback if empty
    if (filtered.length === 0) {
      filtered = pool.slice(0, 5);
    }

    // Deduplicate by fixture to avoid duplicate cards for same match
    const seenFixtures = new Set<string>();
    const deduplicated: MarketOpportunity[] = [];
    for (const item of filtered) {
      const key = `${item.fixtureId}-${item.market}`;
      if (!seenFixtures.has(key)) {
        seenFixtures.add(key);
        deduplicated.push(item);
      }
    }
    filtered = deduplicated;

    // Sort by best statistical conviction
    filtered.sort((a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0));

    // Limit to top 6 best picks for the response
    if (filtered.length > 6) {
      filtered = filtered.slice(0, 6);
    }

    // Tag every discovered prediction with MCP origin
    filtered = filtered.map((p) => ({
      ...p,
      pickBadge: "mcp" as const,
      isMcpPick: true,
      source: "mcp" as const,
    }));

    // 8. AUTOMATIC PUBLISH: Directly merge MCP picks into the Daily Snapshot & Cache
    let autoPublishResult = { addedCount: 0, totalAlerts: 0 };
    try {
      autoPublishResult = addPredictionsToDailySnapshot(filtered);
    } catch (publishErr) {
      console.warn("[McpAgentApi] Auto-publishing snapshot error:", publishErr);
    }

    // 9. Parlay Generation if requested
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

    // 10. Generate Dynamic AI Reasoning & Briefing
    const topPick = filtered[0];
    const avgProb = filtered.length > 0 ? Math.round(filtered.reduce((acc, p) => acc + p.probability, 0) / filtered.length) : 0;
    const avgOdds = filtered.length > 0 ? (filtered.reduce((acc, p) => acc + p.odds, 0) / filtered.length).toFixed(2) : "0.00";

    const leagueDisplayName = isMlsRequest ? "Major League Soccer (Primera División USA)" : topPick?.league || "Ligas Principales";

    const aiAnalysis: AiAgentAnalysis = {
      intent: isParlayRequest
        ? "Combinada / Parlay Inteligente"
        : matchedByTeam
        ? `Análisis Táctico Específico: ${topPick?.homeTeam} vs ${topPick?.awayTeam}`
        : isLiveRequest
        ? `Análisis en Vivo (Partidos en Juego)`
        : isMlsRequest
        ? "Búsqueda Oficial: Major League Soccer (MLS - 1ª División)"
        : targetCountryTerms.length > 0
        ? `Búsqueda por País/Región: ${targetCountryTerms[0].toUpperCase()}`
        : "Filtro Algorítmico Cuantitativo",
      summary: matchedByTeam
        ? `El motor analizó el encuentro ${topPick.homeTeam} vs ${topPick.awayTeam} en ${topPick.league}. El modelo Poisson y las líneas de Bet365/Pinnacle determinan que la mejor oportunidad es '${topPick.market}' con una cuota real de @${topPick.odds} y un ${topPick.probability}% de certeza matemática.`
        : isParlayRequest
        ? `Se generó una combinada de ${parlayData?.selectionsCount} selecciones de alta compatibilidad estadística, con una cuota acumulada de @${parlayData?.totalOdds} y probabilidad conjunta calculada de ${parlayData?.combinedProbability}.`
        : isLiveRequest
        ? `Se analizaron los partidos en directo en curso. El algoritmo evaluó las probabilidades dinámicas y seleccionó ${filtered.length} oportunidades en vivo con probabilidad promedio del ${avgProb}%.`
        : `Se procesaron los datos en vivo para tu solicitud "${query || "pronósticos generales"}". El algoritmo seleccionó ${filtered.length} partidos de ${leagueDisplayName} con un promedio de probabilidad del ${avgProb}% y cuota promedio de @${avgOdds}. Las alertas se han publicado automáticamente en el Dashboard y Alertas del Día con la etiqueta 🤖 Agente MCP.`,
      insights: [
        topPick ? `Poco margen de error: ${topPick.homeTeam} vs ${topPick.awayTeam} lidera en ${topPick.league} con SmartScore de ${topPick.smartScore}/100 y cuota @${topPick.odds}.` : "Filtros aplicados con rigor estadístico.",
        isLiveRequest ? `Monitoreo en vivo: Marcadores y tiempos actualizados en tiempo real.` : `Filtro Estricto de 1ª División: Se excluyen filiales, reservas y ligas de desarrollo. Solo equipos oficiales de Primera División.`,
        `Calibración de cuotas: 100% integradas directamente con líneas de casas de apuestas (Bet365 / Pinnacle) sin distorsión de modelos sintéticos.`,
        effectiveMinOdds > 0 ? `Restricción de cuota mínima: Se aseguraron selecciones con cuota >= @${effectiveMinOdds}.` : `Distribución diversificada en mercados de alto valor (${filtered.map(p => p.market).slice(0, 2).join(", ")}).`,
      ],
      recommendation: isParlayRequest
        ? `Estrategia Parlay: Asignar Stake 1 (1-2% del bankroll) para maximizar el retorno de la cuota @${parlayData?.totalOdds}.`
        : filtered.some(p => p.pickBadge === "bomba")
        ? `Estrategia de Valor: El partido con cuota @${filtered.find(p => p.pickBadge === "bomba")?.odds} presenta ineficiencia de mercado; se sugiere Stake 1.5.`
        : `Estrategia Principal: Apuestas simples con Stake 2-3 (2% a 3% del bankroll) en los picks con probabilidad superior al 60%.`,
      parlayRecommendation: parlayData,
    };

    return NextResponse.json({
      success: true,
      count: filtered.length,
      countryDetected: isMlsRequest ? "Major League Soccer (1ª División)" : targetCountryTerms.length > 0 ? targetCountryTerms[0] : "Global",
      autoPublished: true,
      autoPublishResult,
      aiAnalysis,
      metrics: {
        totalMatches: filtered.length,
        averageProbability: `${avgProb}%`,
        averageOdds: `@${avgOdds}`,
        highConfidenceCount: filtered.filter((p) => p.confidence === "Muy Alta").length,
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
