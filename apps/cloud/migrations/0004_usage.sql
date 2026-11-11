-- How much each account keeps, and all of them together (the row "*"), kept as it changes
-- rather than added up for each upload: room is taken here before a file is kept, so two
-- uploads at once cannot both have the last of it (src/backup.ts, reserve). What a
-- snapshot itself takes counts too ("size").

create table "usage" ("userId" text not null primary key, "used" integer not null default 0);

alter table "snapshot" add column "size" integer not null default 0;

insert into "usage" ("userId", "used") select "userId", sum("size") from "file" group by "userId";

insert into "usage" ("userId", "used") values ('*', (select coalesce(sum("size"), 0) from "file"));
