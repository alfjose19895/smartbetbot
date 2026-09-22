"use client";

import React, { useState } from "react";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";

interface HomePicksGridProps {
  picks: MarketOpportunity[];
}

export function HomePicksGrid({ picks }: HomePicksGridProps) {
  const [selectedPick, setSelectedPick] = useState<MarketOpportunity | null>(null);

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((pick: MarketOpportunity) => (
          <PredictionCard
            key={pick.id || pick.fixtureId}
            prediction={pick}
            onOpenDetail={setSelectedPick}
          />
        ))}
      </div>

      {selectedPick && (
        <MatchDetailModal
          prediction={selectedPick}
          onClose={() => setSelectedPick(null)}
        />
      )}
    </>
  );
}
