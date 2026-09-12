import { redirect } from "next/navigation";

type SearchParams = Promise<{
  market?: string;
  score?: string;
  date_from?: string;
  date_to?: string;
  league_id?: string;
}>;

export default async function PrematchPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.market) params.set("market", query.market);
  if (query.score) params.set("score", query.score);
  if (query.league_id) params.set("league", query.league_id);
  const qs = params.toString() ? `?${params.toString()}` : "";
  redirect(`/signals${qs}`);
}
