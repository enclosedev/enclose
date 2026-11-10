import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

// The tests run in the Workers runtime, on the server as `npm run dev` runs it, with the
// migrations handed over to make its tables with (test/setup.ts), and Google's and
// Apple's keys made up (Apple's, a key made for the tests, its public half handed over
// to check what it signs).
const apple = (await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
)) as CryptoKeyPair
const pkcs8 = new Uint8Array(
  (await crypto.subtle.exportKey("pkcs8", apple.privateKey)) as ArrayBuffer
)
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          GOOGLE_CLIENT_ID: "the-google-client",
          GOOGLE_CLIENT_SECRET: "the-google-secret",
          APPLE_CLIENT_ID: "dev.enclose.test",
          APPLE_TEAM_ID: "TEAM123456",
          APPLE_KEY_ID: "KEY1234567",
          APPLE_PRIVATE_KEY: pem,
          TEST_APPLE_PUBLIC_KEY: (await crypto.subtle.exportKey(
            "jwk",
            apple.publicKey
          )) as unknown as Record<string, string>,
        },
      },
    }),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
}))
