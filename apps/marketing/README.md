# Enclose's website

The landing page for [enclose.dev](https://enclose.dev), built with
[Modulato](https://modulato.org).

```sh
npm install
npm run dev        # SSR + HMR on https://enclose.localhost (portless)
npm run check      # conventions + TypeScript
npm test           # the Markdown for agents, and llms.txt
npm run build      # production build (VERCEL=1 for .vercel/output)
```

`npm run dev` serves a stable, port-free URL via
[portless](https://www.npmjs.com/package/portless) (requires Node >= 24; the
first run asks to trust a local certificate). The domain name lives in
`portless.json`. No Node 24, or a CI/non-TTY environment? `npm run dev:plain`
starts the plain Vite server on a port.

## What is where

```
pages/home/        the page: what it says, and the scroll that moves the window
  tour.ts          the scroll, from stop to stop, and what goes on at each
  motion.ts        where the window is at each stop (tokens, editable in ✦ Tweak)
pages/about/       what Enclose is and who makes it
pages/contact/     where to ask
pages/terms/       the terms
pages/privacy/     the privacy page
agents/            every page in Markdown, for agents that ask for it
components/app/    the app's window, rebuilt out of HTML, and its 3D view
  data.ts          the projects, the conversation and the tools it is filled with
  view.ts          the model, drawn with three.js as the app draws one
shell/             the header, its mark (the brand's, drawn in code) and the footer
tokens/            the type and the colors
public/model/      the robot arm of the app's examples, packed small for the web
public/blueprint/  that arm's blueprint sheets, drawn by the app's own code
scripts/           what makes those two
```

The window on the page is not a picture of the app. It is built again here, to
the app's own sizes and colors, so that the page can say what is in it. When the
app's window changes, `components/app` is what to change to match.

## The model and its drawings

Both are made from [`examples/arm`](../../examples/arm), and are committed, so the
site builds without them being made again:

```sh
npm run model        # public/model: the arm's meshes and edges, simplified
npm run blueprints   # public/blueprint: its sheets, as the app would save them
```

`npm run blueprints` runs the desktop app's own drawing code, so `apps/desktop`
has to have its packages installed.

## Deploying

The site is the Vercel project `enclose`, in the team `glauber-house`, connected to this
repository: a push to `main` puts it up, and any other branch gets a preview. A push
that changes nothing in this folder deploys nothing.

The project's root directory is `apps/marketing`, and nothing else in its build settings
is set: Vercel runs `npm run build`, which writes the output Vercel takes as it is
(`.vercel/output`), on Node 24.

## The download

`/download` and `/download/intel` send whoever asks to the newest disk image for each
kind of Mac. They are set in `vite.config.ts`, and go to GitHub's address for the latest
release's `Enclose-arm64.dmg` and `Enclose-x64.dmg`: the app's releases name their disk
images that way so that a new release needs nothing changed here
([how a release is made](../../docs/development.md#a-release)). The button on the page
goes the same way, and by the right one for the Mac it is read on.

## What the page says, and its link card

The headline, the line under it and what search engines are told are in
`content/site.json` (run `npx modulato content` after changing it). Each page's title,
description and address go through `content/seo.ts`; what is the same on every page is
in `modulato.config.ts`.

```sh
npm run og           # public/og.png: the mark over the headline, 1200 by 630
```

Run it again when the headline or the mark changes. It is drawn by the Chrome on this
machine (`CHROME_PATH` names another), and the picture's alt text in
`modulato.config.ts` repeats the headline, so change that too.

## For agents

`public/llms.txt` says what Enclose is, when to use it and where its documentation is,
as [llmstxt.org](https://llmstxt.org) lays one out. Change it with the pages it lists.

Every page can also be had in Markdown. `npm run build` renders each page once Modulato
has built them and says it again in Markdown (`scripts/agents.ts`), as files beside the
site's own (`/privacy.md`, `/index.html.md` for the first page) and inside a Vercel
Routing Middleware (`agents/middleware.ts`). That answers a request that asks for
`text/markdown` before `text/html` with the page's Markdown, an address with no page
with a Markdown 404, and one that will take neither with a 406; everything else goes on
to the page. Only a request that names Markdown, or would not take HTML, is handed to it
(`agents/routes.ts`): a browser never is. `npm run preview` runs it as Vercel would:

```sh
curl -i -H 'Accept: text/markdown' http://localhost:4173/
```

The build stops where a page's headings skip a level (an h3 straight under the h1), since
that is what an agent reading the page goes by.

## Type

The type is Inter Display: Inter's variable font, loaded in `app.tsx` and held
at its display optical size in `styles/global.scss`. The window is set in Inter
as the app has it. The styles built on both are in `tokens/type.ts`, and the
colors in `tokens/color.ts`.

Open the ✦ Tweak button (dev) to change the type, the colors and every
animation number live — Save writes back into the token files.

The full framework reference is in **MODULATO.md**. If you work with Claude
or another agent, it reads CLAUDE.md and MODULATO.md automatically.
