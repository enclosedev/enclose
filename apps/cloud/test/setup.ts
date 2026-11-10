// Each test file starts with the accounts' tables made, in a database of its own.
import { applyD1Migrations, env } from "cloudflare:test"

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
