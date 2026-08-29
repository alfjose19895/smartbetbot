# Incident response

1. Classify: availability, security/credential, data integrity, provider/quota, or notification.
2. Contain: pause signals and notifications first when correctness is uncertain; preserve ingestion
   evidence unless it worsens the incident. Do not delete losses or raw history.
3. Capture safe evidence: UTC start, commit/deploy IDs, request/worker IDs, affected fixtures/users,
   error codes, and dependency health. Never paste tokens or payloads containing credentials.
4. Recover using the production rollback rules. Use a forward database fix; restore only after a
   confirmed recovery decision and backup review.
5. Validate health, one controlled pipeline cycle, RLS/admin denial, and user-visible consistency.
6. Communicate scope and residual risk. Rotate exposed credentials and invalidate old values.
7. Write a blameless review with detection, timeline, root cause, impact, corrective actions, and
   owners/dates.

For bad signals, disable the affected strategy rather than deleting signals/results. For a quota
incident, pause optional enrichments and odds polling before core fixture reconciliation. For Redis
failure in cloud, expect authenticated API rate limiting and distributed workers to fail closed or
degrade visibly rather than run without coordination.
