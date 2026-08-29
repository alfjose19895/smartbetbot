web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-server-header
prematch: cd backend && python -m app.workers.prematch
live: cd backend && python -m app.workers.live
odds: cd backend && python -m app.workers.odds
probability: cd backend && python -m app.workers.probability
signals: cd backend && python -m app.workers.signals
settlement: cd backend && python -m app.workers.settlement
notifications: cd backend && python -m app.workers.notifications
