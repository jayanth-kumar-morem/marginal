/**
 * The compliance service's own record (SDD §3.20; E11.4).
 *
 * SQLite, from node's own module, because this is one small table per thing and a database server
 * would be a second thing to run and secure. What it keeps is the minimum that makes a decision
 * auditable: which identity a nullifier was issued to, and every screening decision with the list
 * version it was made against.
 *
 * It deliberately does **not** keep what it screened for: a payout route is hashed before it gets
 * here, so the service never learns an address it was not asked about.
 */
import { DatabaseSync } from "node:sqlite";

export interface Issued {
  readonly subject: string;
  readonly listingId: number;
  readonly epoch: number;
  readonly nullifier: string;
}

export interface Screening {
  readonly subject: string;
  readonly routeHash: string;
  readonly screeningId: string;
  readonly blocked: boolean;
  readonly listVersion: string;
  readonly at: number;
}

export interface Store {
  /** Records an issued credential, refusing a second one for the same subject and epoch. */
  issue(record: Issued, at: number): void;
  issuedFor(subject: string, listingId: number, epoch: number): Issued | undefined;
  record(screening: Screening): void;
  screenings(subject: string): Screening[];
  close(): void;
}

export function store(path = ":memory:"): Store {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS nullifiers (
      subject TEXT NOT NULL, listing_id INTEGER NOT NULL, epoch INTEGER NOT NULL,
      nullifier TEXT NOT NULL, issued_at INTEGER NOT NULL,
      PRIMARY KEY (subject, listing_id, epoch)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS screenings (
      subject TEXT NOT NULL, route_hash TEXT NOT NULL, screening_id TEXT NOT NULL,
      blocked INTEGER NOT NULL, list_version TEXT NOT NULL, at INTEGER NOT NULL
    ) STRICT;
  `);
  return {
    issue(record: Issued, at: number): void {
      db.prepare(
        "INSERT OR REPLACE INTO nullifiers (subject, listing_id, epoch, nullifier, issued_at) VALUES (?, ?, ?, ?, ?)",
      ).run(record.subject, record.listingId, record.epoch, record.nullifier, at);
    },
    issuedFor(subject: string, listingId: number, epoch: number): Issued | undefined {
      const row = db
        .prepare("SELECT subject, listing_id, epoch, nullifier FROM nullifiers WHERE subject = ? AND listing_id = ? AND epoch = ?")
        .get(subject, listingId, epoch) as
        | { subject: string; listing_id: number; epoch: number; nullifier: string }
        | undefined;
      return row === undefined
        ? undefined
        : { subject: row.subject, listingId: row.listing_id, epoch: row.epoch, nullifier: row.nullifier };
    },
    record(screening: Screening): void {
      db.prepare(
        "INSERT INTO screenings (subject, route_hash, screening_id, blocked, list_version, at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        screening.subject,
        screening.routeHash,
        screening.screeningId,
        screening.blocked ? 1 : 0,
        screening.listVersion,
        screening.at,
      );
    },
    screenings(subject: string): Screening[] {
      return (
        db
          .prepare("SELECT subject, route_hash, screening_id, blocked, list_version, at FROM screenings WHERE subject = ? ORDER BY at")
          .all(subject) as {
          subject: string;
          route_hash: string;
          screening_id: string;
          blocked: number;
          list_version: string;
          at: number;
        }[]
      ).map((row) => ({
        subject: row.subject,
        routeHash: row.route_hash,
        screeningId: row.screening_id,
        blocked: row.blocked === 1,
        listVersion: row.list_version,
        at: row.at,
      }));
    },
    close(): void {
      db.close();
    },
  };
}
