-- Projects backed up on Enclose Cloud (src/backup.ts). Each file is kept once for each
-- account, in R2 under its SHA-256 (`u/<user>/files/<hash>`), and counted here; each
-- time a project is backed up with something changed, what it was is a snapshot: its
-- files' paths and hashes, in R2 (`u/<user>/snapshots/<id>.json`), and counted here.
-- Deleting an account deletes its rows with it, and src/backup.ts its files in R2.

create table "file" ("userId" text not null references "user" ("id") on delete cascade, "hash" text not null, "size" integer not null, "createdAt" date not null, primary key ("userId", "hash"));

create table "snapshot" ("id" text not null primary key, "userId" text not null references "user" ("id") on delete cascade, "projectId" text not null, "name" text not null, "manifest" text not null, "files" integer not null, "bytes" integer not null, "createdAt" date not null);

create index "snapshot_userId_projectId_idx" on "snapshot" ("userId", "projectId", "createdAt");
