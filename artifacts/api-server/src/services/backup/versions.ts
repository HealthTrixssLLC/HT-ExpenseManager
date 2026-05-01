/**
 * Backup payload version chain.
 *
 * `CURRENT_VERSION` is the schema version we *write* on every export. The
 * `UPGRADE_CHAIN` lets us read older zips: each entry takes a payload at
 * version `N` and returns the equivalent payload at version `N + 1`. To
 * restore a v1 zip on an app that writes v3 we run the v1→v2 then the v2→v3
 * upgraders in order. Restores of payloads newer than `CURRENT_VERSION` are
 * rejected: this service can only roll forward, never sideways.
 *
 * Version 1 is the inaugural payload and the chain is therefore empty. As
 * the schema evolves, add new versions here and write a corresponding test
 * fixture under `./__test__/fixtures/v<N>.json` proving the upgrade is
 * lossless for fields the new schema cares about.
 */

export const CURRENT_BACKUP_SCHEMA_VERSION = 1;

export type UpgradeFn = (payload: unknown) => unknown;

/**
 * Sparse map keyed by the *source* version. `UPGRADE_CHAIN[N]` upgrades a
 * payload at version `N` to version `N + 1`. Versions equal to or greater
 * than `CURRENT_BACKUP_SCHEMA_VERSION` do not appear here because there is
 * nothing to upgrade them to.
 */
export const UPGRADE_CHAIN: Readonly<Record<number, UpgradeFn>> = {
  // 1 -> 2: not yet defined. When you add v2, declare it here:
  //   1: (payload) => upgradeV1ToV2(payload as BackupPayloadV1),
};

export function upgradeToCurrent(
  payload: unknown,
  fromVersion: number,
): unknown {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new BackupVersionError(
      `Invalid backupSchemaVersion: ${String(fromVersion)}`,
    );
  }
  if (fromVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    throw new BackupVersionError(
      `Backup is from a newer app (schema v${fromVersion}); ` +
        `this app understands up to v${CURRENT_BACKUP_SCHEMA_VERSION}.`,
    );
  }
  let cur = payload;
  for (let v = fromVersion; v < CURRENT_BACKUP_SCHEMA_VERSION; v += 1) {
    const fn = UPGRADE_CHAIN[v];
    if (!fn) {
      throw new BackupVersionError(
        `Missing upgrader from v${v} to v${v + 1}`,
      );
    }
    cur = fn(cur);
  }
  return cur;
}

export class BackupVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupVersionError";
    Object.setPrototypeOf(this, BackupVersionError.prototype);
  }
}
