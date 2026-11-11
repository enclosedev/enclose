-- When a project's snapshot last used each of its files: a file not used by any snapshot
-- kept (the last SNAPSHOTS_KEPT of the project) is let go of with the snapshots that had
-- it, and deleted once no project uses it (src/backup.ts, prune). Rows from before are
-- taken as used by the project's newest snapshot, so none is let go of by mistake.

alter table "project_file" add column "lastSeen" integer not null default 0;

update "project_file" set "lastSeen" = coalesce((select max("createdAt") from "snapshot" s where s."userId" = "project_file"."userId" and s."projectId" = "project_file"."projectId"), 0);
