import Anthropic from "@anthropic-ai/sdk";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

/**
 * SmartBetBot AI Sports Analyst powered by Anthropic Claude (claude-3-5-sonnet-latest).
 * Acts as a quantitative sports risk assessor and tactical reasoning engine.
 */

const CLAUDE_MODEL = "claude-3-5-sonnet-latest";

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  return new Anthropic({ apiKey });
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 10);
}

export interface ClaudeMatchAudit {
  fixtureId: string | number;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  odds: number;
  approved: boolean;
  convictionScore: number; // 0 to 100
  trapRisk: "Bajo" | "Moderado" | "Alto";
  keyRiskFactor: string;
  tacticalReasoning: string;
  recommendedStake: string; // e.g., "Stake 2 (2% Bankroll)"
}

export interface ClaudeAgentAnalysisResult {
  intent: string;
  summary: string;
  tacticalInsights: string[];
  riskWarnings: string[];
  recommendedStrategy: string;
  approvedPredictions: MarketOpportunity[];
}

/**
 * System prompt setting up Claude as an elite quantitative sports betting risk analyst.
 */
const SPORTS_ANALYST_SYSTEM_PROMPT = `Eres el Analista Cuantitativo y Director de Riesgo Deportivo Senior de SmartBetBot.
Tu misión es auditar pronósticos matemáticos de fútbol y filtrar exclusivamente las oportunidades de mayor valor esperado (+EV), detectando y eliminando "Cuotas Trampa", partidos con alta varianza o sesgos estadísticos engañosos.

Reglas de análisis profesional:
1. RIGOR ANALÍTICO: No todas las cuotas bajas son seguras. Una cuota @1.40 con riesgo de rotación o relajación es una trampa mortal para el bankroll.
2. DETECCIÓN DE TRAMPAS: Identifica si un equipo tiene partidos de copa/Champions entre semana, si su racha reciente fue contra rivales débiles, o si el mercado está sobrevalorando su nombre.
3. CONVICCIÓN ESTADÍSTICA: Asigna una puntuación de convicción (0-100). Solo aprueba pronósticos con convicción >= 70.
4. RAZONAMIENTO CLARO Y CONCISO: Explica en 2-3 frases tácticas y directas por qué la apuesta tiene ventaja sobre la casa de apuestas (Bet365 / Pinnacle).
5. RESPUESTA EN JSON ESTRICTO: Cuando se solicite formato JSON, devuelve ÚNICAMENTE el bloque JSON válido sin comentarios ni texto introductorio.`;

/**
 * Audits a batch of mathematically generated predictions through Claude 3.5 Sonnet.
 * Filters out low-conviction picks and enriches approved ones with tactical reasoning.
 */
export async function auditPredictionsBatchWithClaude(
  predictions: MarketOpportunity[]
): Promise<{
  approvedPicks: MarketOpportunity[];
  audits: ClaudeMatchAudit[];
  usedClaude: boolean;
}> {
  const client = getAnthropicClient();
  if (!client || predictions.length === 0) {
    return {
      approvedPicks: predictions,
      audits: [],
      usedClaude: false,
    };
  }

  try {
    const simplifiedCandidates = predictions.map((p) => ({
      fixtureId: p.fixtureId,
      match: `${p.homeTeam} vs ${p.awayTeam}`,
      league: p.league,
      country: p.country,
      kickoff: p.kickoff,
      market: p.market,
      selection: p.selection,
      odds: p.odds,
      mathematicalProbability: `${p.probability}%`,
      edge: `${p.edge}%`,
      smartScore: p.smartScore,
      h2hSummary: p.h2h ? p.h2h.slice(0, 3).map((h) => `${h.homeTeam} ${h.score} ${h.awayTeam}`).join(" | ") : "N/A",
      homeRecentForm: p.homeLast5 ? p.homeLast5.slice(0, 3).map((f) => `${f.result} (${f.score})`).join(", ") : "N/A",
      awayRecentForm: p.awayLast5 ? p.awayLast5.slice(0, 3).map((f) => `${f.result} (${f.score})`).join(", ") : "N/A",
    }));

    const prompt = `Audita la siguiente lista de ${predictions.length} pronósticos cuantitativos para la fecha de hoy:
${JSON.stringify(simplifiedCandidates, null, 2)}

Para cada pronóstico, analiza el valor real frente a la cuota, evalúa si es una cuota trampa, determina si debe ser APROBADO o RECHAZADO, y genera una justificación táctica.

Devuelve un JSON con la siguiente estructura:
{
  "audits": [
    {
      "fixtureId": "string o número",
      "approved": true / false,
      "convictionScore": 0-100,
      "trapRisk": "Bajo" | "Moderado" | "Alto",
      "keyRiskFactor": "Breve factor de riesgo identificado",
      "tacticalReasoning": "Explicación profesional de 2 frases con fundamentos tácticos y valor esperado",
      "recommendedStake": "Stake 1 (1%)" | "Stake 2 (2%)" | "Stake 3 (3%)"
    }
  ]
}`;

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      temperature: 0.2, // Low temperature for high quantitative consistency
      system: SPORTS_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { approvedPicks: predictions, audits: [], usedClaude: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { audits: ClaudeMatchAudit[] };
    const auditMap = new Map<string, ClaudeMatchAudit>();
    for (const a of parsed.audits || []) {
      auditMap.set(String(a.fixtureId), a);
    }

    const enrichedPicks: MarketOpportunity[] = [];
    for (const pred of predictions) {
      const audit = auditMap.get(String(pred.fixtureId));
      if (audit && audit.approved) {
        enrichedPicks.push({
          ...pred,
          smartScore: Math.round((pred.smartScore + audit.convictionScore) / 2),
          explanation: audit.tacticalReasoning || pred.explanation,
          pickBadge: audit.convictionScore >= 90 ? "valor" : pred.pickBadge,
        });
      } else if (!audit) {
        enrichedPicks.push(pred);
      }
    }

    // Sort by combined conviction score
    enrichedPicks.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0));

    return {
      approvedPicks: enrichedPicks.length > 0 ? enrichedPicks : predictions,
      audits: parsed.audits || [],
      usedClaude: true,
    };
  } catch (error) {
    console.error("[ClaudeAnalyst] Error during batch prediction audit:", error);
    return {
      approvedPicks: predictions,
      audits: [],
      usedClaude: false,
    };
  }
}

/**
 * Deep Sports Intelligence reasoning query using Claude 3.5 Sonnet.
 * Powers the MCP Natural Language Assistant.
 */
export async function queryClaudeSportsAgent(params: {
  query: string;
  country?: string;
  candidatePicks: MarketOpportunity[];
  todayDateStr: string;
}): Promise<ClaudeAgentAnalysisResult | null> {
  const client = getAnthropicClient();
  if (!client) {
    return null;
  }

  try {
    const { query, country = "", candidatePicks, todayDateStr } = params;

    const contextPayload = {
      userQuery: query,
      countryFilter: country,
      todayDate: todayDateStr,
      availableMatchesCount: candidatePicks.length,
      matches: candidatePicks.slice(0, 15).map((p) => ({
        fixtureId: p.fixtureId,
        match: `${p.homeTeam} vs ${p.awayTeam}`,
        league: p.league,
        kickoff: p.kickoff,
        market: p.market,
        odds: p.odds,
        probability: `${p.probability}%`,
        status: p.status,
      })),
    };

    const prompt = `Analiza la siguiente solicitud del usuario sobre las oportunidades deportivas de hoy (${todayDateStr}):
Solicitud del usuario: "${query}" ${country ? `(Filtro de país: ${country})` : ""}

Contexto de partidos disponibles hoy:
${JSON.stringify(contextPayload, null, 2)}

Instrucciones:
1. Responde a la intención del usuario con un análisis cuantitativo de élite.
2. Si hay partidos disponibles hoy que coinciden con su petición, selecciona los 1 a 5 mejores picks fundamentados.
3. Si NO hay partidos programados para hoy que coincidan con la búsqueda, explica con honestidad que hoy no hay acción en esa liga/país y advierte que no se deben buscar partidos futuros para evitar apuestas precipitadas.
4. Genera insights tácticos y advertencias de riesgo.

Devuelve un JSON estrictamente estructurado:
{
  "intent": "Resumen de la intención",
  "summary": "Resumen ejecutivo del análisis para el usuario",
  "tacticalInsights": ["Insight 1", "Insight 2", "Insight 3"],
  "riskWarnings": ["Advertencia de riesgo 1", "Advertencia de riesgo 2"],
  "recommendedStrategy": "Recomendación de gestión de stake / bankroll",
  "selectedFixtureIds": [array de fixtureIds aprobados]
}`;

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.3,
      system: SPORTS_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      intent: string;
      summary: string;
      tacticalInsights: string[];
      riskWarnings: string[];
      recommendedStrategy: string;
      selectedFixtureIds: (string | number)[];
    };

    const selectedIds = new Set((parsed.selectedFixtureIds || []).map(String));
    const approvedPredictions = candidatePicks.filter((p) => selectedIds.has(String(p.fixtureId)));

    return {
      intent: parsed.intent || "Análisis de Inteligencia Deportiva con Claude",
      summary: parsed.summary || "",
      tacticalInsights: parsed.tacticalInsights || [],
      riskWarnings: parsed.riskWarnings || [],
      recommendedStrategy: parsed.recommendedStrategy || "Stake 2 (2% del bankroll)",
      approvedPredictions: approvedPredictions.length > 0 ? approvedPredictions : candidatePicks.slice(0, 3),
    };
  } catch (err) {
    console.error("[ClaudeAnalyst] Error querying sports agent:", err);
    return null;
  }
}
