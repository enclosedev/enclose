import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

// The tests run in the Workers runtime, on the server as `npm run dev` runs it, with the
// migrations handed over to make its tables with (test/setup.ts).
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") },
      },
    }),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
}))
