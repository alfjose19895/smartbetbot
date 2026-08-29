-- SmartBetBot Phases 16-25: notification idempotency and operational indexes.

create unique index notifications_user_signal_push_idx
on public.notifications (user_id, signal_id, channel)
where signal_id is not null;

create index signal_results_settled_signal_idx
on public.signal_results (settled_at desc, result_status, signal_id);

create index signals_backtest_filters_idx
on public.signals (
  triggered_at, signal_type, market, strategy_id,
  model_probability, edge, smart_score, decimal_odds
);

comment on index public.notifications_user_signal_push_idx is
'Prevents duplicate push queue entries for one user and signal.';
