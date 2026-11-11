-- Which files each project backed up has used, in any of its snapshots: a file is kept
-- while some project has used it, and goes once none has (src/backup.ts, removeProjects).

create table "project_file" ("userId" text not null references "user" ("id") on delete cascade, "projectId" text not null, "hash" text not null, primary key ("userId", "projectId", "hash"));

create index "project_file_userId_hash_idx" on "project_file" ("userId", "hash");
