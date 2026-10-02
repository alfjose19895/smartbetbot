import { NHLTeamStats, NHLStartingGoalie } from './nhl-types';

export const NHL_LEAGUE_AVERAGES = {
  goalsPerGame: 3.08, // Average per team per game (~6.16 total)
  savePct: 0.903,
  shootingPct: 0.100,
  powerPlayPct: 0.205,
  penaltyKillPct: 0.795,
  homeIceAdvantageFactor: 1.065 // ~53.5% Home Win baseline
};

// Realistic team profiles for all 32 NHL franchises
export const NHL_TEAM_PROFILES: Record<string, Partial<NHLTeamStats>> = {
  'anaheim ducks': { goalsForPerGame: 2.45, goalsAgainstPerGame: 3.55, savePct: 0.895, powerPlayPct: 0.175, penaltyKillPct: 0.765, homeGpg: 2.55, homeGaa: 3.40, awayGpg: 2.35, awayGaa: 3.70 },
  'boston bruins': { goalsForPerGame: 3.10, goalsAgainstPerGame: 2.65, savePct: 0.912, powerPlayPct: 0.210, penaltyKillPct: 0.825, homeGpg: 3.25, homeGaa: 2.45, awayGpg: 2.95, awayGaa: 2.85 },
  'buffalo sabres': { goalsForPerGame: 2.95, goalsAgainstPerGame: 3.20, savePct: 0.900, powerPlayPct: 0.185, penaltyKillPct: 0.780, homeGpg: 3.10, homeGaa: 3.10, awayGpg: 2.80, awayGaa: 3.30 },
  'calgary flames': { goalsForPerGame: 2.85, goalsAgainstPerGame: 3.15, savePct: 0.902, powerPlayPct: 0.180, penaltyKillPct: 0.805, homeGpg: 3.00, homeGaa: 2.95, awayGpg: 2.70, awayGaa: 3.35 },
  'carolina hurricanes': { goalsForPerGame: 3.35, goalsAgainstPerGame: 2.50, savePct: 0.910, powerPlayPct: 0.245, penaltyKillPct: 0.845, homeGpg: 3.50, homeGaa: 2.30, awayGpg: 3.20, awayGaa: 2.70 },
  'chicago blackhawks': { goalsForPerGame: 2.35, goalsAgainstPerGame: 3.50, savePct: 0.898, powerPlayPct: 0.170, penaltyKillPct: 0.770, homeGpg: 2.45, homeGaa: 3.35, awayGpg: 2.25, awayGaa: 3.65 },
  'colorado avalanche': { goalsForPerGame: 3.60, goalsAgainstPerGame: 3.05, savePct: 0.903, powerPlayPct: 0.250, penaltyKillPct: 0.810, homeGpg: 3.85, homeGaa: 2.85, awayGpg: 3.35, awayGaa: 3.25 },
  'columbus blue jackets': { goalsForPerGame: 2.80, goalsAgainstPerGame: 3.60, savePct: 0.893, powerPlayPct: 0.165, penaltyKillPct: 0.760, homeGpg: 2.95, homeGaa: 3.45, awayGpg: 2.65, awayGaa: 3.75 },
  'dallas stars': { goalsForPerGame: 3.45, goalsAgainstPerGame: 2.70, savePct: 0.911, powerPlayPct: 0.235, penaltyKillPct: 0.820, homeGpg: 3.60, homeGaa: 2.50, awayGpg: 3.30, awayGaa: 2.90 },
  'detroit red wings': { goalsForPerGame: 3.10, goalsAgainstPerGame: 3.25, savePct: 0.901, powerPlayPct: 0.220, penaltyKillPct: 0.795, homeGpg: 3.25, homeGaa: 3.10, awayGpg: 2.95, awayGaa: 3.40 },
  'edmonton oilers': { goalsForPerGame: 3.65, goalsAgainstPerGame: 2.85, savePct: 0.905, powerPlayPct: 0.270, penaltyKillPct: 0.815, homeGpg: 3.90, homeGaa: 2.65, awayGpg: 3.40, awayGaa: 3.05 },
  'florida panthers': { goalsForPerGame: 3.30, goalsAgainstPerGame: 2.55, savePct: 0.913, powerPlayPct: 0.230, penaltyKillPct: 0.830, homeGpg: 3.45, homeGaa: 2.35, awayGpg: 3.15, awayGaa: 2.75 },
  'los angeles kings': { goalsForPerGame: 3.05, goalsAgainstPerGame: 2.60, savePct: 0.910, powerPlayPct: 0.195, penaltyKillPct: 0.840, homeGpg: 3.15, homeGaa: 2.45, awayGpg: 2.95, awayGaa: 2.75 },
  'minnesota wild': { goalsForPerGame: 3.00, goalsAgainstPerGame: 3.05, savePct: 0.902, powerPlayPct: 0.215, penaltyKillPct: 0.785, homeGpg: 3.15, homeGaa: 2.90, awayGpg: 2.85, awayGaa: 3.20 },
  'montreal canadiens': { goalsForPerGame: 2.75, goalsAgainstPerGame: 3.45, savePct: 0.898, powerPlayPct: 0.185, penaltyKillPct: 0.775, homeGpg: 2.90, homeGaa: 3.30, awayGpg: 2.60, awayGaa: 3.60 },
  'nashville predators': { goalsForPerGame: 3.15, goalsAgainstPerGame: 2.90, savePct: 0.908, powerPlayPct: 0.205, penaltyKillPct: 0.800, homeGpg: 3.30, homeGaa: 2.70, awayGpg: 3.00, awayGaa: 3.10 },
  'new jersey devils': { goalsForPerGame: 3.30, goalsAgainstPerGame: 3.10, savePct: 0.900, powerPlayPct: 0.225, penaltyKillPct: 0.805, homeGpg: 3.45, homeGaa: 2.95, awayGpg: 3.15, awayGaa: 3.25 },
  'new york islanders': { goalsForPerGame: 2.80, goalsAgainstPerGame: 2.95, savePct: 0.910, powerPlayPct: 0.190, penaltyKillPct: 0.790, homeGpg: 2.90, homeGaa: 2.75, awayGpg: 2.70, awayGaa: 3.15 },
  'new york rangers': { goalsForPerGame: 3.35, goalsAgainstPerGame: 2.65, savePct: 0.914, powerPlayPct: 0.240, penaltyKillPct: 0.835, homeGpg: 3.50, homeGaa: 2.45, awayGpg: 3.20, awayGaa: 2.85 },
  'ottawa senators': { goalsForPerGame: 3.00, goalsAgainstPerGame: 3.35, savePct: 0.896, powerPlayPct: 0.190, penaltyKillPct: 0.770, homeGpg: 3.15, homeGaa: 3.20, awayGpg: 2.85, awayGaa: 3.50 },
  'philadelphia flyers': { goalsForPerGame: 2.85, goalsAgainstPerGame: 3.10, savePct: 0.900, powerPlayPct: 0.155, penaltyKillPct: 0.830, homeGpg: 2.95, homeGaa: 2.95, awayGpg: 2.75, awayGaa: 3.25 },
  'pittsburgh penguins': { goalsForPerGame: 3.05, goalsAgainstPerGame: 3.15, savePct: 0.902, powerPlayPct: 0.175, penaltyKillPct: 0.805, homeGpg: 3.20, homeGaa: 3.00, awayGpg: 2.90, awayGaa: 3.30 },
  'san jose sharks': { goalsForPerGame: 2.25, goalsAgainstPerGame: 3.80, savePct: 0.892, powerPlayPct: 0.160, penaltyKillPct: 0.750, homeGpg: 2.35, homeGaa: 3.65, awayGpg: 2.15, awayGaa: 3.95 },
  'seattle kraken': { goalsForPerGame: 2.70, goalsAgainstPerGame: 2.95, savePct: 0.906, powerPlayPct: 0.185, penaltyKillPct: 0.795, homeGpg: 2.80, homeGaa: 2.80, awayGpg: 2.60, awayGaa: 3.10 },
  'st. louis blues': { goalsForPerGame: 2.85, goalsAgainstPerGame: 3.10, savePct: 0.904, powerPlayPct: 0.180, penaltyKillPct: 0.785, homeGpg: 2.95, homeGaa: 2.95, awayGpg: 2.75, awayGaa: 3.25 },
  'tampa bay lightning': { goalsForPerGame: 3.45, goalsAgainstPerGame: 3.10, savePct: 0.903, powerPlayPct: 0.275, penaltyKillPct: 0.810, homeGpg: 3.65, homeGaa: 2.90, awayGpg: 3.25, awayGaa: 3.30 },
  'toronto maple leafs': { goalsForPerGame: 3.55, goalsAgainstPerGame: 3.00, savePct: 0.905, powerPlayPct: 0.240, penaltyKillPct: 0.780, homeGpg: 3.75, homeGaa: 2.80, awayGpg: 3.35, awayGaa: 3.20 },
  'utah mammoth': { goalsForPerGame: 2.90, goalsAgainstPerGame: 3.20, savePct: 0.900, powerPlayPct: 0.190, penaltyKillPct: 0.790, homeGpg: 3.05, homeGaa: 3.05, awayGpg: 2.75, awayGaa: 3.35 },
  'vancouver canucks': { goalsForPerGame: 3.35, goalsAgainstPerGame: 2.75, savePct: 0.912, powerPlayPct: 0.225, penaltyKillPct: 0.810, homeGpg: 3.50, homeGaa: 2.55, awayGpg: 3.20, awayGaa: 2.95 },
  'vegas golden knights': { goalsForPerGame: 3.25, goalsAgainstPerGame: 2.85, savePct: 0.907, powerPlayPct: 0.210, penaltyKillPct: 0.815, homeGpg: 3.45, homeGaa: 2.65, awayGpg: 3.05, awayGaa: 3.05 },
  'washington capitals': { goalsForPerGame: 2.75, goalsAgainstPerGame: 3.15, savePct: 0.904, powerPlayPct: 0.190, penaltyKillPct: 0.790, homeGpg: 2.90, homeGaa: 3.00, awayGpg: 2.60, awayGaa: 3.30 },
  'winnipeg jets': { goalsForPerGame: 3.10, goalsAgainstPerGame: 2.40, savePct: 0.920, powerPlayPct: 0.200, penaltyKillPct: 0.835, homeGpg: 3.25, homeGaa: 2.20, awayGpg: 2.95, awayGaa: 2.60 },
};

export class NHLFeatureEngine {
  public static getTeamBaselineStats(teamName: string, teamId: number | string = 0): NHLTeamStats {
    const norm = (teamName || '').toLowerCase().trim();
    let profile: Partial<NHLTeamStats> | undefined = undefined;

    for (const [k, v] of Object.entries(NHL_TEAM_PROFILES)) {
      if (norm.includes(k) || k.includes(norm)) {
        profile = v;
        break;
      }
    }

    const gfg = profile?.goalsForPerGame ?? 3.05;
    const gag = profile?.goalsAgainstPerGame ?? 3.05;
    const sv = profile?.savePct ?? 0.903;
    const pp = profile?.powerPlayPct ?? 0.205;
    const pk = profile?.penaltyKillPct ?? 0.795;
    const hGpg = profile?.homeGpg ?? (gfg + 0.15);
    const hGaa = profile?.homeGaa ?? (gag - 0.15);
    const aGpg = profile?.awayGpg ?? (gfg - 0.15);
    const aGaa = profile?.awayGaa ?? (gag + 0.15);

    return {
      teamId,
      teamName,
      gamesPlayed: 38,
      wins: 20,
      losses: 14,
      otLosses: 4,
      points: 44,
      goalsForPerGame: gfg,
      goalsAgainstPerGame: gag,
      shotsForPerGame: 30.5,
      shotsAgainstPerGame: 30.0,
      shootingPct: 0.100,
      savePct: sv,
      powerPlayPct: pp,
      penaltyKillPct: pk,
      powerPlayOpportunitiesPerGame: 3.1,
      penaltyMinutesPerGame: 8.0,
      homeGpg: hGpg,
      homeGaa: hGaa,
      awayGpg: aGpg,
      awayGaa: aGaa,
      last5Gpg: gfg,
      last5Gaa: gag,
      restDays: 1,
      isBackToBack: false,
    };
  }

  public static applyShrinkage(teamValue: number, leagueAvg: number, gamesPlayed: number, priorWeight: number = 10): number {
    if (gamesPlayed <= 0) return leagueAvg;
    return (gamesPlayed * teamValue + priorWeight * leagueAvg) / (gamesPlayed + priorWeight);
  }

  public static calculateGoalieAdjustment(stats: NHLTeamStats): { goalieFactor: number; goalieQualityScore: number } {
    if (!stats.startingGoalie) {
      return { goalieFactor: 1.0, goalieQualityScore: 5 };
    }

    const goalie = stats.startingGoalie;
    const svPct = goalie.savePct > 0 ? goalie.savePct : NHL_LEAGUE_AVERAGES.savePct;
    const diff = svPct - NHL_LEAGUE_AVERAGES.savePct;
    let factor = 1.0 - (diff * 8.0);
    factor = Math.max(0.85, Math.min(1.18, factor));

    const goalieQualityScore = goalie.isConfirmed ? 15 : 8;
    return { goalieFactor: Number(factor.toFixed(3)), goalieQualityScore };
  }

  public static calculateExpectedGoals(
    homeStats: NHLTeamStats,
    awayStats: NHLTeamStats
  ): { lambdaHome: number; lambdaAway: number; dataQuality: number } {
    const lgAvg = NHL_LEAGUE_AVERAGES.goalsPerGame;

    // 1. Offense and Defense base rates
    const homeOff = this.applyShrinkage(homeStats.goalsForPerGame, lgAvg, homeStats.gamesPlayed);
    const homeDef = this.applyShrinkage(homeStats.goalsAgainstPerGame, lgAvg, homeStats.gamesPlayed);
    const awayOff = this.applyShrinkage(awayStats.goalsForPerGame, lgAvg, awayStats.gamesPlayed);
    const awayDef = this.applyShrinkage(awayStats.goalsAgainstPerGame, lgAvg, awayStats.gamesPlayed);

    // 2. Goalie adjustments
    const homeGoalie = this.calculateGoalieAdjustment(homeStats);
    const awayGoalie = this.calculateGoalieAdjustment(awayStats);

    // 3. Special Teams Multipliers
    const homePpEfficiency = (homeStats.powerPlayPct / NHL_LEAGUE_AVERAGES.powerPlayPct) * ((1 - awayStats.penaltyKillPct) / (1 - NHL_LEAGUE_AVERAGES.penaltyKillPct));
    const awayPpEfficiency = (awayStats.powerPlayPct / NHL_LEAGUE_AVERAGES.powerPlayPct) * ((1 - homeStats.penaltyKillPct) / (1 - NHL_LEAGUE_AVERAGES.penaltyKillPct));

    const homeStAdj = 1.0 + (homePpEfficiency - 1.0) * 0.08;
    const awayStAdj = 1.0 + (awayPpEfficiency - 1.0) * 0.08;

    // 4. Base lambdas
    let lambdaHome = lgAvg * (homeOff / lgAvg) * (awayDef / lgAvg) * NHL_LEAGUE_AVERAGES.homeIceAdvantageFactor * homeStAdj * awayGoalie.goalieFactor;
    let lambdaAway = lgAvg * (awayOff / lgAvg) * (homeDef / lgAvg) * awayStAdj * homeGoalie.goalieFactor;

    // 5. Rest / Back-to-Back fatigue
    if (homeStats.isBackToBack) lambdaHome *= 0.94;
    if (awayStats.isBackToBack) lambdaAway *= 0.93;
    if (homeStats.restDays >= 2) lambdaHome *= 1.02;
    if (awayStats.restDays >= 2) lambdaAway *= 1.02;

    let dataQuality = 65;
    const minGames = Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed);
    if (minGames >= 15) dataQuality += 20;
    else if (minGames >= 8) dataQuality += 10;

    dataQuality += homeGoalie.goalieQualityScore + awayGoalie.goalieQualityScore;

    return {
      lambdaHome: Number(Math.max(1.5, Math.min(5.5, lambdaHome)).toFixed(2)),
      lambdaAway: Number(Math.max(1.5, Math.min(5.5, lambdaAway)).toFixed(2)),
      dataQuality: Math.min(100, dataQuality)
    };
  }
}
