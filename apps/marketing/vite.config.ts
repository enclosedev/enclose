import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import modulato from '@modulato/vite'
import { MARKDOWN_ROUTES } from './agents/routes'

// The ways to the app. A release's disk images are named for the kind of Mac and not
// for the version (apps/desktop/scripts/dist.mjs), and GitHub answers an address like
// these with whichever release is the latest: so /download is always the newest, and a
// release needs nothing changed here.
const LATEST = 'https://github.com/enclosedev/enclose/releases/latest/download'
const DOWNLOADS: Record<string, string> = {
  '/download': `${LATEST}/Enclose-arm64.dmg`,
  '/download/intel': `${LATEST}/Enclose-x64.dmg`,
}

/** The same ways while the site is worked on, where there is no host to send them. */
const downloads = (): Plugin => ({
  name: 'enclose-downloads',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const asked = (request as { url?: string }).url ?? ''
      const to = DOWNLOADS[asked.split('?')[0].replace(/(.)\/$/, '$1')]
      if (!to) return next()
      response.statusCode = 302
      response.setHeader('Location', to)
      response.end()
    })
  },
})

export default defineConfig({
  plugins: [
    react(),
    downloads(),
    modulato({
      vercel: {
        routes: [
          ...Object.entries(DOWNLOADS).map(([path, Location]) => ({
            src: `^${path}/?$`,
            status: 302,
            headers: { Location },
          })),
          // every page in Markdown too, for agents that ask for it (agents/)
          ...MARKDOWN_ROUTES,
        ],
      },
    }),
  ],
})
