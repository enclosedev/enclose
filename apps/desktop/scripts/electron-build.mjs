// How the Electron side is bundled, shared by the dev loop and the production build. And
// with it the page an assembly guide is shown as, which the Electron side hands out.

/** The app's own process. Packages stay external: they are loaded from node_modules. */
export const main = {
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.js",
  platform: "node",
  format: "esm",
  target: "node22",
  bundle: true,
  packages: "external",
  sourcemap: true,
  logLevel: "warning",
}

/** The preload runs sandboxed, where only CommonJS and the `electron` module are allowed. */
export const preload = {
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  platform: "node",
  format: "cjs",
  target: "node22",
  bundle: true,
  external: ["electron"],
  sourcemap: true,
  logLevel: "warning",
}

/**
 * The page of an assembly guide (src/guide): one script and one sheet of styles, with
 * everything they need in them. It is opened in a browser, from this machine or from a
 * folder it was taken away in, where a script is loaded whole or not at all: so it is
 * no module, and there is nothing for it to fetch.
 */
export const guide = {
  entryPoints: { page: "src/guide/page.ts" },
  outdir: "dist-electron/guide",
  platform: "browser",
  format: "iife",
  target: "es2020",
  bundle: true,
  minify: true,
  alias: { "@": "./src", "@shared": "./shared" },
  loader: { ".woff2": "dataurl" },
  logLevel: "warning",
}
