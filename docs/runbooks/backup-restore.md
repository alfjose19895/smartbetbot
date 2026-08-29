# Backup and restore

Before production, confirm the Supabase plan's current backup retention in Database → Backups.
Paid projects currently receive managed daily backups and can add PITR; free projects need regular
logical exports. Storage objects require a separate procedure because database backups contain
their metadata, not deleted object contents.

Before a migration or high-risk release:

1. record the latest managed restore point and its UTC time;
2. take a logical export when policy requires it and store it encrypted outside the application
   repository;
3. verify the export is non-empty and test restoration into an isolated disposable project;
4. record expected RPO/RTO and the person authorized to restore.

A production restore is destructive and causes downtime. Pause all workers and the API write path,
confirm the target project and restore timestamp with two people, preserve incident evidence, then
restore through the Supabase-supported workflow. Afterward, rotate custom-role passwords if the
backup method excludes them, reapply required secrets, verify migrations/RLS/Auth, and run the full
deployment smoke before resuming workers in dependency order.

Official reference: [Supabase database backups](https://supabase.com/docs/guides/platform/backups).
