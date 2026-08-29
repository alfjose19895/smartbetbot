export function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

export function score(value: number | null): string {
  return value === null ? "—" : Math.round(value).toString();
}

export function odds(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export function units(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} u`;
}

export function marketLabel(market: string, selection: string, line: number | null): string {
  const names: Record<string, string> = {
    total_goals: "Total de goles",
    both_teams_to_score: "Ambos marcan",
    match_winner: "Ganador del partido",
    double_chance: "Doble oportunidad",
    next_goal: "Próximo gol",
  };
  return `${names[market] || market.replaceAll("_", " ")} · ${selection.toUpperCase()}${line === null ? "" : ` ${line}`}`;
}

export function dateTime(value: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Guayaquil",
  }).format(new Date(value));
}
