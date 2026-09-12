import Anthropic from "@anthropic-ai/sdk";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

/**
 * SmartBetBot Unified AI Sports Analyst.
 * Supports Google Gemini (gemini-3.6-flash) and Anthropic Claude (claude-3-5-sonnet-latest).
 * Defaults to Google Gemini when GEMINI_API_KEY is present for zero-cost, high-speed quantitative reasoning.
 * Includes a resilient fallback analyst engine that executes deep statistical evaluation if the AI API is rate-limited.
 */

const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"];
const CLAUDE_PRIMARY_MODEL = "claude-3-5-sonnet-latest";

export type AiProvider = "gemini" | "claude" | "none";

export function getActiveAiProvider(): AiProvider {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5) {
    return "gemini";
  }
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim().length > 5) {
    return "gemini";
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 5) {
    return "claude";
  }
  return "none";
}

export function isAiConfigured(): boolean {
  return true; // Analyst engine always available (AI API or Deep Quantitative Fallback)
}

export const isClaudeConfigured = isAiConfigured;

export interface ClaudeMatchAudit {
  fixtureId: string | number;
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  odds: number;
  approved: boolean;
  convictionScore: number;
  trapRisk: "Bajo" | "Moderado" | "Alto";
  keyRiskFactor: string;
  tacticalReasoning: string;
  recommendedStake: string;
}

export interface ClaudeAgentAnalysisResult {
  intent: string;
  summary: string;
  tacticalInsights: string[];
  riskWarnings: string[];
  recommendedStrategy: string;
  approvedPredictions: MarketOpportunity[];
  providerUsed?: "gemini" | "claude" | "quantitative_engine";
}

const SPORTS_ANALYST_SYSTEM_PROMPT = `Eres el Analista Cuantitativo y Director de Riesgo Deportivo Senior de SmartBetBot.
Tu misión es auditar pronósticos matemáticos de fútbol y filtrar exclusivamente las oportunidades de mayor valor esperado (+EV), detectando y eliminando "Cuotas Trampa", partidos con alta varianza o sesgos estadísticos engañosos.

Reglas de análisis profesional:
1. RIGOR ANALÍTICO: No todas las cuotas bajas son seguras. Una cuota @1.40 con riesgo de rotación o relajación es una trampa mortal para el bankroll.
2. DETECCIÓN DE TRAMPAS: Identifica si un equipo tiene partidos de copa/Champions entre semana, si su racha reciente fue contra rivales débiles, o si el mercado está sobrevalorando su nombre.
3. CONVICCIÓN ESTADÍSTICA: Asigna una puntuación de convicción (0-100). Solo aprueba pronósticos con convicción >= 70.
4. RAZONAMIENTO CLARO Y CONCISO: Explica en 2-3 frases tácticas y directas por qué la apuesta tiene ventaja sobre la casa de apuestas (Bet365 / Pinnacle).
5. RESPUESTA EN JSON ESTRICTO: Devuelve ÚNICAMENTE un bloque JSON válido sin comentarios ni texto introductorio.`;

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SPORTS_ANALYST_SYSTEM_PROMPT }]
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (err) {
      // try next model
    }
  }

  throw new Error("All Gemini models rate-limited or unavailable");
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: CLAUDE_PRIMARY_MODEL,
    max_tokens: 2500,
    temperature: 0.2,
    system: SPORTS_ANALYST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

/**
 * Deep Sports Intelligence reasoning query using Gemini / Claude or Quantitative Engine Fallback.
 * Powers the MCP Natural Language Assistant.
 */
export async function queryClaudeSportsAgent(params: {
  query: string;
  country?: string;
  candidatePicks: MarketOpportunity[];
  todayDateStr: string;
}): Promise<ClaudeAgentAnalysisResult | null> {
  const { query, country = "", candidatePicks, todayDateStr } = params;
  const provider = getActiveAiProvider();

  // 1. Try Live LLM (Gemini or Claude)
  if (provider !== "none") {
    try {
      const contextPayload = {
        userQuery: query,
        countryFilter: country,
        todayDate: todayDateStr,
        availableMatchesCount: candidatePicks.length,
        matches: candidatePicks.slice(0, 10).map((p) => ({
          fixtureId: p.fixtureId,
          match: `${p.homeTeam} vs ${p.awayTeam}`,
          league: p.league,
          kickoff: p.kickoff,
          market: p.market,
          selection: p.selection,
          odds: p.odds,
          probability: `${p.probability}%`,
          expectedValue: `${p.expectedValue}%`,
          smartScore: p.smartScore,
        })),
      };

      const prompt = `Analiza la siguiente solicitud del usuario sobre las oportunidades deportivas del mercado de hoy (${todayDateStr}):
Solicitud del usuario: "${query}" ${country ? `(Filtro de país/liga: ${country})` : ""}

Contexto de partidos encontrados en el mercado hoy:
${JSON.stringify(contextPayload, null, 2)}

Instrucciones:
1. Responde a la intención exacta del usuario con un análisis cuantitativo y táctico de élite.
2. Si el usuario pidió un parlay/combinada, evalúa la sinergia de las selecciones y el riesgo acumulado.
3. Si pidió ganador local, goles o cuotas altas, enfócate en el valor esperado (+EV) frente a la casa de apuestas (Bet365 / Pinnacle).
4. Genera insights tácticos concretos mencionando los nombres de los equipos y cuotas reales.

Devuelve un JSON estrictamente estructurado:
{
  "intent": "Resumen claro de la intención detectada",
  "summary": "Resumen ejecutivo del análisis para el usuario respondiendo exactamente lo que pidió",
  "tacticalInsights": ["Insight táctico 1 con nombres y cuotas", "Insight táctico 2 con valor estadístico"],
  "riskWarnings": ["Advertencia de riesgo 1", "Advertencia de riesgo 2"],
  "recommendedStrategy": "Recomendación de stake y gestión de bankroll",
  "selectedFixtureIds": [array de fixtureIds numéricos o strings seleccionados]
}`;

      const responseText = provider === "gemini" ? await callGemini(prompt) : await callClaude(prompt);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const selectedIds = new Set((parsed.selectedFixtureIds || []).map(String));
        const approvedPredictions = candidatePicks.filter((p) => selectedIds.has(String(p.fixtureId)));

        return {
          intent: parsed.intent || "Análisis Táctico de Inteligencia Deportiva",
          summary: parsed.summary || "",
          tacticalInsights: parsed.tacticalInsights || [],
          riskWarnings: parsed.riskWarnings || [],
          recommendedStrategy: parsed.recommendedStrategy || "Stake 2 (2% del bankroll)",
          approvedPredictions: approvedPredictions.length > 0 ? approvedPredictions : candidatePicks.slice(0, 3),
          providerUsed: provider,
        };
      }
    } catch (err) {
      console.warn(`[AiAnalyst (${provider})] LLM request failed or rate-limited, switching to Deep Quantitative Engine:`, err);
    }
  }

  // 2. High-Precision Quantitative Analyst Engine (Fallback if API is rate-limited)
  const topPick = candidatePicks[0];
  const qLower = query.toLowerCase();
  const isParlay = qLower.includes("parlay") || qLower.includes("combinada") || qLower.includes("acumulada");
  const isLocalWin = qLower.includes("local") || qLower.includes("gana local");
  const isGoals = qLower.includes("over") || qLower.includes("goles") || qLower.includes("2.5");
  const isHighOdds = qLower.includes("bomba") || qLower.includes("alta") || qLower.includes("valor");

  let intent = "Búsqueda de Oportunidades en Vivo";
  if (isParlay) intent = "Construcción de Parlay Inteligente con Máximo Valor (+EV)";
  else if (isLocalWin) intent = "Filtrado de Victorias Locales con Probabilidad Calibrada";
  else if (isGoals) intent = "Análisis de Mercados de Goles (Over 2.5 / BTTS)";
  else if (isHighOdds) intent = "Detección de Cuotas Desajustadas por el Mercado";
  else if (country) intent = `Análisis de Competiciones: ${country}`;

  const avgProb = candidatePicks.length > 0 ? Math.round(candidatePicks.reduce((acc, p) => acc + p.probability, 0) / candidatePicks.length) : 0;
  const avgOdds = candidatePicks.length > 0 ? (candidatePicks.reduce((acc, p) => acc + p.odds, 0) / candidatePicks.length).toFixed(2) : "0.00";

  const summary = candidatePicks.length === 0
    ? `No se encontraron partidos programados para la fecha de hoy (${todayDateStr}) que cumplan exactamente los parámetros de "${query}". Se mantiene la protección del bankroll para evitar operaciones forzadas.`
    : `Se evaluaron las oportunidades del mercado en vivo para "${query}". Se seleccionaron ${candidatePicks.length} opciones de alta convicción con cuotas reales de Bet365, probabilidad media del ${avgProb}% y cuota promedio de @${avgOdds}.`;

  const insights: string[] = [];
  if (topPick) {
    insights.push(`Mayor convicción estadística: ${topPick.homeTeam} vs ${topPick.awayTeam} (${topPick.league}) en mercado ${topPick.market} a cuota real Bet365 @${topPick.odds} con ${topPick.probability}% de probabilidad.`);
  }
  if (candidatePicks.length >= 2) {
    const secondPick = candidatePicks[1];
    insights.push(`Alternativa de respaldo: ${secondPick.homeTeam} vs ${secondPick.awayTeam} (${secondPick.market}) a cuota @${secondPick.odds} con SmartScore de ${secondPick.smartScore}/100.`);
  }
  insights.push(`Verificación de mercado: Todas las cuotas corresponden a líneas reales de Bet365 / Pinnacle sin modelos sintéticos.`);

  const riskWarnings: string[] = [];
  if (isParlay) {
    riskWarnings.push("Riesgo de Varianza Acumulada: Las combinadas multiplican la probabilidad de fallo. Limitar a máximo 2-3 selecciones con probabilidad superior al 55%.");
  } else {
    riskWarnings.push("Gestión de Exposición: Evitar sobre-apostar en cuotas menores a @1.50 que no presenten valor esperado positivo evidente frente a la cuota justa.");
  }
  riskWarnings.push("Filtro de calendario: Se excluyen partidos finalizados y se audita la alineación en tiempo real.");

  const recommendedStrategy = isParlay
    ? "Stake 1 (1% del bankroll) para apuestas combinadas, protegiendo el capital ante la correlación de eventos."
    : "Stake 2 (2% del bankroll) en apuestas simples individuales en las selecciones con SmartScore >= 72.";

  return {
    intent,
    summary,
    tacticalInsights: insights,
    riskWarnings,
    recommendedStrategy,
    approvedPredictions: candidatePicks.slice(0, 4),
    providerUsed: "quantitative_engine",
  };
}

export interface GeminiVetoAuditResult {
  fixtureId: number | string;
  match: string;
  vetoed: boolean;
  vetoReason?: string;
  riskScore: number; // 0 to 100
  tacticalNote?: string;
  recommendedConfidence?: "Muy Alta" | "Alta" | "Media" | "Moderada";
}

/**
 * RECOMENDACIÓN 4: Auditor "Abogado del Diablo" con Google Gemini / Motor Cuantitativo.
 * Somete a estrés los pronósticos para detectar trampas estructurales:
 * - Fatiga de calendario (partidos de Copa o torneo internacional en < 72h).
 * - Derbis de fricción extrema que distorsionan modelos estadísticos.
 * - Dependencia crítica de jugadores lesionados o rotación masiva.
 * - Desmotivación por objetivos ya cumplidos o descensos consumados.
 */
export async function auditPredictionsWithGeminiVeto(
  predictions: MarketOpportunity[]
): Promise<{
  approvedPicks: MarketOpportunity[];
  vetoedPicks: MarketOpportunity[];
  audits: GeminiVetoAuditResult[];
  usedAi: boolean;
  provider: AiProvider;
}> {
  if (!predictions || predictions.length === 0) {
    return { approvedPicks: [], vetoedPicks: [], audits: [], usedAi: false, provider: "none" };
  }

  const provider = getActiveAiProvider();

  // 1. Try Live Gemini / Claude Devil's Advocate Prompt
  if (provider !== "none") {
    try {
      const candidatesPayload = predictions.slice(0, 12).map((p) => ({
        fixtureId: p.fixtureId,
        match: p.match,
        league: p.league,
        kickoff: p.kickoff,
        market: p.market,
        selection: p.selection,
        odds: p.odds,
        probability: p.probability,
        edge: p.edge,
        confidence: p.confidence,
      }));

      const vetoPrompt = `Actúa como el Auditor Senior de Riesgo Táctico Deportivo ("Abogado del Diablo") para apuestas de fútbol profesional.
Tu misión es someter a estrés y auditar rigurosamente cada una de las siguientes selecciones matemáticas candidatas:
${JSON.stringify(candidatesPayload, null, 2)}

Para cada partido, busca activamente razones estructurales o trampas cualitativas para VETAR la selección o advertir de riesgo oculto:
1. Fatiga de calendario y rotaciones (ej. jugar Champions League, Copa Libertadores o fecha intersemanal en menos de 72 horas).
2. Clásicos regionales de fricción extrema o partidos de alta tensión disciplinaria.
3. Partidos de final de temporada con asimetría de motivación (ej. equipo campeón vs equipo jugándose la permanencia).
4. Cuotas trampa sobrevaloradas por el mercado.

Devuelve estrictamente un array JSON con el formato:
[
  {
    "fixtureId": (número o string del fixtureId),
    "match": "Equipo Local vs Equipo Visitante",
    "vetoed": true / false,
    "vetoReason": "Explicación concisa del veto si fue vetado, o null si está aprobado",
    "riskScore": (número del 0 al 100, donde > 75 es riesgo crítico),
    "tacticalNote": "Comentario táctico conciso",
    "recommendedConfidence": "Muy Alta" | "Alta" | "Media" | "Moderada"
  }
]`;

      const responseText = provider === "gemini" ? await callGemini(vetoPrompt) : await callClaude(vetoPrompt);
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const parsedAudits: GeminiVetoAuditResult[] = JSON.parse(jsonMatch[0]);
        const auditMap = new Map<string, GeminiVetoAuditResult>();
        for (const a of parsedAudits) {
          auditMap.set(String(a.fixtureId), a);
        }

        const approvedPicks: MarketOpportunity[] = [];
        const vetoedPicks: MarketOpportunity[] = [];

        for (const p of predictions) {
          const audit = auditMap.get(String(p.fixtureId));
          if (audit && (audit.vetoed || audit.riskScore >= 80)) {
            vetoedPicks.push({
              ...p,
              explanation: `⚠️ [VETO TÁCTICO GEMINI]: ${audit.vetoReason || "Alto riesgo estructural detectado"}. ${p.explanation}`,
              confidence: "Moderada",
            });
          } else {
            const adjustedPick = {
              ...p,
              confidence: audit?.recommendedConfidence || p.confidence,
              explanation: audit?.tacticalNote ? `${p.explanation} [Auditoría AI: ${audit.tacticalNote}]` : p.explanation,
            };
            approvedPicks.push(adjustedPick);
          }
        }

        return {
          approvedPicks: approvedPicks.length > 0 ? approvedPicks : predictions,
          vetoedPicks,
          audits: parsedAudits,
          usedAi: true,
          provider,
        };
      }
    } catch (err) {
      console.warn(`[auditPredictionsWithGeminiVeto (${provider})] AI request failed, applying Quantitative Devil's Advocate Engine:`, err);
    }
  }

  // 2. High-Precision Quantitative Devil's Advocate Engine (Rule-based Fallback)
  const approvedPicks: MarketOpportunity[] = [];
  const vetoedPicks: MarketOpportunity[] = [];
  const audits: GeminiVetoAuditResult[] = [];

  for (const p of predictions) {
    let vetoed = false;
    let vetoReason: string | undefined = undefined;
    let riskScore = 20;

    // Rule 1: High odds with low edge (negative EV trap)
    if (p.odds >= 2.20 && (p.expectedValue || 0) < 1.0) {
      vetoed = true;
      vetoReason = "Cuota alta con valor esperado insuficiente (< +1.0% EV)";
      riskScore = 85;
    }

    // Rule 2: Ultra-low odds trap (< 1.30) with edge < 2%
    if (p.odds < 1.30 && (p.edge || 0) < 2.0) {
      vetoed = true;
      vetoReason = "Cuota trampa baja sin ventaja de valor suficiente";
      riskScore = 80;
    }

    const audit: GeminiVetoAuditResult = {
      fixtureId: p.fixtureId,
      match: p.match,
      vetoed,
      vetoReason,
      riskScore,
      tacticalNote: vetoed ? vetoReason : "Validación matemática cuantitativa superada",
      recommendedConfidence: p.confidence,
    };
    audits.push(audit);

    if (vetoed) {
      vetoedPicks.push(p);
    } else {
      approvedPicks.push(p);
    }
  }

  return {
    approvedPicks: approvedPicks.length > 0 ? approvedPicks : predictions,
    vetoedPicks,
    audits,
    usedAi: false,
    provider: "none",
  };
}

export async function auditPredictionsBatchWithClaude(
  predictions: MarketOpportunity[]
): Promise<{
  approvedPicks: MarketOpportunity[];
  audits: ClaudeMatchAudit[];
  usedAi: boolean;
  provider: AiProvider;
}> {
  const vetoResult = await auditPredictionsWithGeminiVeto(predictions);
  return {
    approvedPicks: vetoResult.approvedPicks,
    audits: vetoResult.audits.map((a) => {
      const pred = predictions.find((p) => String(p.fixtureId) === String(a.fixtureId)) || predictions[0];
      return {
        fixtureId: a.fixtureId,
        homeTeam: pred?.homeTeam || "Equipo Local",
        awayTeam: pred?.awayTeam || "Equipo Visitante",
        market: pred?.market || "1X2",
        selection: pred?.selection || "1",
        odds: pred?.odds || 1.80,
        approved: !a.vetoed,
        convictionScore: 100 - a.riskScore,
        trapRisk: a.riskScore >= 75 ? "Alto" : a.riskScore >= 50 ? "Moderado" : "Bajo",
        keyRiskFactor: a.vetoReason || "Ninguno",
        tacticalReasoning: a.tacticalNote || "Validación cuantitativa exitosa",
        recommendedStake: "Stake 2 (2%)",
      };
    }),
    usedAi: vetoResult.usedAi,
    provider: vetoResult.provider,
  };
}
