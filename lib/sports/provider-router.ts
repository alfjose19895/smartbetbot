import { SupportedSport, SportsDataProvider } from './types';
import { NBAProvider } from './nba/nba-provider';
import { NFLProvider } from './nfl/nfl-provider';
import { NCAAFProvider } from './ncaaf/ncaaf-provider';
import { NHLProvider } from './nhl/nhl-provider';
import { isSportFeatureEnabled } from './config';
import { SPORTS_REGISTRY } from './registry';

export class SportProviderRouter {
  private static providers: Partial<Record<SupportedSport, SportsDataProvider>> = {
    nba: new NBAProvider(),
    nfl: new NFLProvider(),
    ncaaf: new NCAAFProvider(),
    nhl: new NHLProvider()
  };

  public static getProvider(sport: SupportedSport): SportsDataProvider | null {
    if (sport === 'football') {
      return null;
    }
    return this.providers[sport] || null;
  }

  public static async runDiagnostics(): Promise<Record<SupportedSport, {
    status: 'OK' | 'ERROR' | 'DISABLED';
    name: string;
    message: string;
    enabled: boolean;
  }>> {
    const results = {} as Record<SupportedSport, {
      status: 'OK' | 'ERROR' | 'DISABLED';
      name: string;
      message: string;
      enabled: boolean;
    }>;
    const sports: SupportedSport[] = ['football', 'nba', 'nfl', 'ncaaf', 'nhl'];

    for (const sport of sports) {
      const meta = SPORTS_REGISTRY[sport];
      const isEnabled = isSportFeatureEnabled(sport);

      if (!isEnabled) {
        results[sport] = {
          status: 'DISABLED',
          name: meta.displayName,
          message: 'Módulo deshabilitado por feature flag.',
          enabled: false
        };
        continue;
      }

      if (sport === 'football') {
        const apiKey = process.env.API_FOOTBALL_KEY;
        results.football = {
          status: apiKey ? 'OK' : 'ERROR',
          name: 'Fútbol (API-Football)',
          message: apiKey ? 'Football Provider operativo.' : 'API_FOOTBALL_KEY ausente.',
          enabled: true
        };
      } else {
        const provider = this.getProvider(sport);
        if (!provider) {
          results[sport] = {
            status: 'ERROR',
            name: meta.displayName,
            message: 'Provider no instanciado.',
            enabled: true
          };
        } else {
          const diag = await provider.getDiagnostics();
          results[sport] = {
            status: diag.status,
            name: `${meta.displayName} (${provider.name})`,
            message: diag.message,
            enabled: true
          };
        }
      }
    }

    return results;
  }
}
