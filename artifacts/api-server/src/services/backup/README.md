# Backup & restore service

System Admins can export every row of org-scoped data into a single ZIP
archive, and later restore the same archive into the same org. The service
that powers `/admin/backup` and `/admin/restore` lives here.

## Archive layout

```
healthtrix-backup-<timestamp>.zip
├── manifest.json          (always)
├── payload.json           (always)
└── receipts/
    └── <receipt-id>.<ext>  (only when "Include receipt files" was checked)
```

### `manifest.json` — `ManifestV1`

| Field                  | Notes                                               |
| ---------------------- | --------------------------------------------------- |
| `backupSchemaVersion`  | Integer. Drives the upgrade chain in `versions.ts`. |
| `appVersion`           | Semver string of the API that wrote the archive.    |
| `orgId`                | Source org's UUID. Restore checks this matches.     |
| `orgName`              | Display name at export time.                        |
| `createdAt`            | ISO-8601 timestamp the archive was generated.       |
| `includesReceiptFiles` | True if `receipts/` is populated.                   |
| `receiptCount`         | Total receipt rows in the payload.                  |
| `rowCounts`            | Per-table row counts for quick triage.              |

### `payload.json` — `BackupPayloadV<N>`

A literal dump of every org-scoped table, ordered to make insertion
trivially correct under FKs. All UUIDs are preserved verbatim so external
references (such as `displayCode` on reports) remain stable across a
round-trip.

## Versioning

`versions.ts` defines `CURRENT_BACKUP_SCHEMA_VERSION` (the version we write
on every export) and `UPGRADE_CHAIN`, a sparse map keyed by the *source*
version. `UPGRADE_CHAIN[N]` upgrades a payload at version `N` to version
`N + 1`. When the schema changes, bump the version and add a new upgrader
that performs the migration in JavaScript.

`upgradeToCurrent` walks the chain in order. Backups newer than this app
understands are rejected with `BackupVersionError` — the service can only
roll forward.

## Restore semantics

`applyRestore` is wrapped in a single Drizzle transaction:

1. The org row is `DELETE`d, which cascades through every FK chain (users
   → sessions, reports → line items / receipts / approval actions, payroll
   batches → items / reconciliation, etc.). This guarantees the org is in a
   "blank" state before the payload is replayed.
2. Inserts run in dependency order. Users are inserted first with their
   `managerId` nulled, then patched in a second pass so the self-referential
   FK is satisfied without ordering tricks.
3. On any insert error the transaction rolls back; the archive is rejected
   and the org is left in its pre-restore state.

Receipt-file re-uploads happen *after* the transaction commits because
object storage cannot enroll in a Postgres transaction. Failures are
collected as warnings on the `RestoreResult` rather than rolling the DB
back: a partially-corrupt zip still restores the database side, and the
admin can retry the file portion separately.

## Wrong-org protection

Every restore call asserts both `manifest.orgId` and `payload.org.id` match
the caller's current `orgId`. A mismatch throws `BackupOrgMismatchError`,
which the route translates into HTTP 400 with `code: backup.org_mismatch`.
Admins cannot accidentally overwrite an org with another org's data.
