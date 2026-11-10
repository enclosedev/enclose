// what the tests are given besides the server's own bindings (vitest.config.ts)
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[]
    TEST_APPLE_PUBLIC_KEY: JsonWebKey
  }
}
