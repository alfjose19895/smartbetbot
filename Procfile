web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-server-header
realtime-worker: cd backend && python -m app.workers.realtime
jobs-worker: cd backend && python -m app.workers.jobs
workers: cd backend && python -m app.workers.combined
