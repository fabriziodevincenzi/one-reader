# Migration history archive

These migrations are retained for audit and source-history purposes only.

On 1 September 2026, the local migration timestamps and the remote One Reader
migration history were found to be irreconcilably out of sync. The active
`supabase/migrations` directory therefore starts with a schema baseline pulled
from the production database. All future schema changes must be added there as
new migrations.
