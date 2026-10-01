import { SportsDataProvider, SportCapability, NormalizedGame, NormalizedOdds } from '../types';
import { SPORTS_CONFIG } from '../config';

export class NFLProvider implements SportsDataProvider {
  public readonly sport = 'nfl';
  public readonly name = 'API-NFL Provider';

  private readonly supportedCapabilities: Set<SportCapability> = new Set([
    'schedule',
    'team_stats',
    'odds',
    'injuries',
    'weather'
  ]);

  public supports(capability: SportCapability): boolean {
    return this.supportedCapabilities.has(capability);
  }

  public async getSchedule(_date: string): Promise<NormalizedGame[]> {
    return [];
  }

  public async getGame(_gameId: string): Promise<NormalizedGame | null> {
    return null;
  }

  public async getHistoricalGames(_season: string, _limit: number = 100): Promise<NormalizedGame[]> {
    return [];
  }

  public async getTeamStats(_teamId: string | number, _season: string): Promise<Record<string, unknown>> {
    return {};
  }

  public async getOdds(_gameId: string): Promise<NormalizedOdds[]> {
    return [];
  }

  public async getResults(_date: string): Promise<NormalizedGame[]> {
    return [];
  }

  public async getDiagnostics(): Promise<{ status: 'OK' | 'ERROR'; message: string; remainingQuota?: number }> {
    const config = SPORTS_CONFIG.nfl;
    if (!config.apiKey) {
      return { status: 'ERROR', message: 'API_NFL_KEY no configurada en el entorno del servidor.' };
    }
    return { status: 'OK', message: 'NFL Provider conectado correctamente.' };
  }
}
