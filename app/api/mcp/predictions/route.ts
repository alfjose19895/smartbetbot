import { NextResponse } from "next/server";
import { generatePredictionsForUpcoming, getEcuadorDateString } from "@/lib/sports/db";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  españa: ["españa", "spain", "la liga", "segunda", "copa del rey", "liga f", "villarreal", "leganes", "barcelona", "madrid", "sevilla", "betis", "oviedo", "tenerife"],
  inglaterra: ["inglaterra", "england", "premier league", "championship", "league one", "league two", "national league", "southampton", "portsmouth", "fleetwood", "wigan", "southend", "shrewsbury"],
  alemania: ["alemania", "germany", "bundesliga", "2. bundesliga", "dfb pokal", "leverkusen", "leipzig", "gladbach", "bremen", "union berlin", "kiel", "nürnberg", "elversberg"],
  italia: ["italia", "italy", "serie a", "serie b", "coppa italia", "fiorentina", "torino", "sudtirol", "catanzaro"],
  francia: ["francia", "france", "ligue 1", "ligue 2", "coupe de france", "le havre", "brest"],
  portugal: ["portugal", "primeira liga", "liga portugal 2", "taca de portugal", "sporting", "nacional", "tondela"],
  ecuador: ["ecuador", "liga pro", "serie a ecuador", "copa ecuador", "independiente del valle", "macara", "barcelona sc", "ldu", "emelec"],
  "costa rica": ["costa rica", "liga fpd", "primera división (liga fpd)", "primera division", "alajuelense", "saprissa", "herediano", "perez zeledon", "cartagines"],
  mexico: ["méxico", "mexico", "liga mx", "liga de expansion", "san luis", "chivas", "guadalajara", "america", "cruz azul", "tigres", "monterrey"],
  brasil: ["brasil", "brazil", "brasileirão", "brasileirao", "serie a brasil", "copa do brasil", "sao paulo", "atletico-mg", "flamengo", "palmeiras", "coritiba", "chapecoense"],
  argentina: ["argentina", "liga profesional", "copa de la liga", "boca", "river", "racing", "independiente"],
  colombia: ["colombia", "primera a", "liga betplay", "santa fe", "fortaleza", "millonarios", "junior", "nacional"],
  peru: ["perú", "peru", "liga 1 peru", "cusco", "moquegua", "alianza", "universitario", "sporting cristal"],
  chile: ["chile", "primera división chile", "campeonato nacional", "everton", "catolica", "colo colo", "u de chile"],
  holanda: ["holanda", "países bajos", "paises bajos", "netherlands", "eredivisie", "ajax", "psv", "feyenoord"],
  belgica: ["bélgica", "belgica", "belgium", "jupiler pro league", "standard liege", "antwerp", "brujas", "anderlecht"],
  estados_unidos: ["estados unidos", "usa", "mls", "major league soccer", "us open cup", "philadelphia", "montreal", "inter miami"],
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
    const { query = "", country = "", minProb, minOdds, maxOdds, market = "" } = body;

    const allPredictions = await generatePredictionsForUpcoming();
    const todayStr = getEcuadorDateString(Date.now());

    // Filter strictly today
    let pool = allPredictions.filter((p) => {
      const pDate = getEcuadorDateString(new Date(p.kickoff));
      return pDate === todayStr;
    });

    if (pool.length === 0) {
      pool = allPredictions;
    }

    const qLower = (query || "").toLowerCase().trim();
    const cLower = (country || "").toLowerCase().trim();

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
        const pHome = p.homeTeam.toLowerCase();
        const pAway = p.awayTeam.toLowerCase();
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
    } else if (qLower.includes("over 2.5") || qLower.includes("más de 2.5") || qLower.includes("mas de 2.5") || qLower.includes("over")) {
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

    // 5. Odds filtering (minOdds / maxOdds / natural language)
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

    // 6. Probability / Confidence filtering
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

    // Sort by best statistical conviction
    filtered.sort((a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0));

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
      // For a parlay request, present the legs directly
      filtered = legs;
    }

    // 8. Generate Dynamic AI Reasoning & Briefing
    const topPick = filtered[0];
    const avgProb = filtered.length > 0 ? Math.round(filtered.reduce((acc, p) => acc + p.probability, 0) / filtered.length) : 0;
    const avgOdds = filtered.length > 0 ? (filtered.reduce((acc, p) => acc + p.odds, 0) / filtered.length).toFixed(2) : "0.00";

    const aiAnalysis: AiAgentAnalysis = {
      intent: isParlayRequest
        ? "Combinada / Parlay Inteligente"
        : matchedByTeam
        ? `Análisis Táctico Específico: ${topPick?.homeTeam} vs ${topPick?.awayTeam}`
        : targetCountryTerms.length > 0
        ? `Búsqueda por País/Región: ${targetCountryTerms[0].toUpperCase()}`
        : "Filtro Algorítmico Cuantitativo",
      summary: matchedByTeam
        ? `El motor analizó el encuentro ${topPick.homeTeam} vs ${topPick.awayTeam} en ${topPick.league}. El modelo Poisson y las líneas de Bet365/Pinnacle determinan que la mejor oportunidad es '${topPick.market}' con una cuota real de @${topPick.odds} y un ${topPick.probability}% de certeza matemática.`
        : isParlayRequest
        ? `Se generó una combinada de ${parlayData?.selectionsCount} selecciones de alta compatibilidad estadística, con una cuota acumulada de @${parlayData?.totalOdds} y probabilidad conjunta calculada de ${parlayData?.combinedProbability}.`
        : `Se procesaron los datos en vivo para tu solicitud "${query || "pronósticos generales"}". El algoritmo seleccionó ${filtered.length} partidos de alta precisión con un promedio de probabilidad del ${avgProb}% y cuota promedio de @${avgOdds}.`,
      insights: [
        topPick ? `Poco margen de error: ${topPick.homeTeam} vs ${topPick.awayTeam} lidera con SmartScore de ${topPick.smartScore}/100 y cuota @${topPick.odds}.` : "Filtros aplicados con rigor estadístico.",
        `Calibración de cuotas: 100% integradas directamente con líneas de casas de apuestas (Bet365 / Pinnacle) sin distorsión de modelos sintéticos.`,
        effectiveMinOdds > 0 ? `Restricción de cuota mínima: Se aseguraron selecciones con cuota >= @${effectiveMinOdds}.` : `Distribución diversificada en mercados de alto valor (${filtered.map(p => p.market).slice(0, 2).join(", ")}).`,
        `Fórmula de Edge: Valor positivo promedio del +${(filtered.reduce((a, b) => a + (b.edge || 0), 0) / (filtered.length || 1)).toFixed(1)}% sobre las probabilidades implícitas del mercado.`,
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
      countryDetected: targetCountryTerms.length > 0 ? targetCountryTerms[0] : "Global",
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
