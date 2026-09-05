import { NextResponse } from "next/server";
import { generatePredictionsForUpcoming, getEcuadorDateString } from "@/lib/sports/db";

const COUNTRY_SYNONYMS: Record<string, string[]> = {
  españa: ["españa", "spain", "la liga", "segunda", "copa del rey", "liga f"],
  inglaterra: ["inglaterra", "england", "premier league", "championship", "league one", "league two", "national league"],
  alemania: ["alemania", "germany", "bundesliga", "2. bundesliga", "dfb pokal"],
  italia: ["italia", "italy", "serie a", "serie b", "coppa italia"],
  francia: ["francia", "france", "ligue 1", "ligue 2", "coupe de france"],
  portugal: ["portugal", "primeira liga", "liga portugal 2", "taca de portugal"],
  ecuador: ["ecuador", "liga pro", "serie a ecuador", "copa ecuador"],
  "costa rica": ["costa rica", "liga fpd", "primera división", "primera division"],
  mexico: ["méxico", "mexico", "liga mx", "liga de expansion"],
  brasil: ["brasil", "brazil", "brasileirão", "brasileirao", "serie a brasil", "copa do brasil"],
  argentina: ["argentina", "liga profesional", "copa de la liga"],
  colombia: ["colombia", "primera a", "liga betplay"],
  peru: ["perú", "peru", "liga 1 peru"],
  chile: ["chile", "primera división chile", "campeonato nacional"],
  holanda: ["holanda", "países bajos", "paises bajos", "netherlands", "eredivisie"],
  belgica: ["bélgica", "belgica", "belgium", "jupiler pro league"],
  estados_unidos: ["estados unidos", "usa", "mls", "major league soccer", "us open cup"],
  china: ["china", "super league", "chinese super league"],
  ucrania: ["ucrania", "ukraine", "premier league ucrania"],
  croacia: ["croacia", "croatia", "hnl"],
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query = "", country = "", minProb = 50, market = "" } = body;

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

    // 1. Detect requested country from query or explicit parameter
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

    // 2. Filter by country if specified
    let filtered = pool;
    if (targetCountryTerms.length > 0) {
      filtered = filtered.filter((p) => {
        const pCountry = (p.country || "").toLowerCase();
        const pLeague = (p.league || "").toLowerCase();
        return targetCountryTerms.some(
          (term) => pCountry.includes(term) || pLeague.includes(term) || term.includes(pCountry)
        );
      });
    }

    // 3. Filter by Market if requested
    const mLower = (market || "").toLowerCase().trim();
    if (mLower || qLower.includes("ganador") || qLower.includes("goles") || qLower.includes("ambos")) {
      const activeMarketFilter = mLower || (
        qLower.includes("ganador local") || qLower.includes("gana local") ? "ganador local" :
        qLower.includes("ganador visitante") || qLower.includes("gana visitante") ? "ganador visitante" :
        qLower.includes("over") || qLower.includes("mas de") || qLower.includes("más de") ? "over 2.5" :
        qLower.includes("ambos") || qLower.includes("btts") ? "ambos equipos" : ""
      );

      if (activeMarketFilter) {
        filtered = filtered.filter((p) =>
          p.market.toLowerCase().includes(activeMarketFilter)
        );
      }
    }

    // 4. Filter by minimum probability
    if (minProb > 50) {
      filtered = filtered.filter((p) => p.probability >= minProb);
    }

    // Sort by conviction / probability
    filtered.sort((a, b) => b.probability - a.probability || (b.smartScore || 0) - (a.smartScore || 0));

    // Summary statistics
    const avgProb = filtered.length > 0
      ? Math.round(filtered.reduce((acc, p) => acc + p.probability, 0) / filtered.length)
      : 0;

    const avgOdds = filtered.length > 0
      ? (filtered.reduce((acc, p) => acc + p.odds, 0) / filtered.length).toFixed(2)
      : "0.00";

    return NextResponse.json({
      success: true,
      count: filtered.length,
      countryDetected: targetCountryTerms.length > 0 ? targetCountryTerms[0] : "Todos los Países",
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
