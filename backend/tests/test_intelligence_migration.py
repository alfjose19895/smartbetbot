from pathlib import Path


def test_phases_11_15_migration_has_identity_idempotency_and_security_contract() -> None:
    migration = (
        Path(__file__).parents[2] / "supabase/migrations/202608260001_phases11_15_intelligence.sql"
    ).read_text()

    for table in (
        "canonical_leagues",
        "league_provider_links",
        "canonical_teams",
        "team_provider_links",
    ):
        assert f"create table public.{table}" in migration
        assert f"alter table public.{table} enable row level security" in migration
        assert f"revoke all on table public.{table}" in migration
    assert "predictions_fingerprint_idx" in migration
    assert "'probability', 'signal'" in migration
    assert "where slug = 'live-over-05-pressure'" in migration
    assert "where slug = 'prematch-over-15'" in migration
    assert "where slug = 'btts-prematch'" in migration

    selection_fix = (
        Path(__file__).parents[2]
        / "supabase/migrations/202608260002_phase12_strategy_selection_fix.sql"
    ).read_text()
    assert "config_json = config_json - 'selection'" in selection_fix
