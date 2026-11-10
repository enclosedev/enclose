# Contributing to Enclose

Thank you for wanting to. Enclose is young and mostly one person's work, so a few habits
keep it manageable.

## Before you start

- A small fix (a bug, a typo, a clearer message) needs no asking: open a pull request.
- Anything bigger, and anything that changes how the app looks or behaves, starts as an
  issue. Say what you would change and why, with a picture if it is something seen. How
  Enclose looks and works is designed on purpose, and a change to it is talked over
  before it is built.

## Running it

You need Node 22 or newer. It is tried on macOS and on Arch Linux. The app is in
`apps/desktop`, and its commands are run from there.

```
cd apps/desktop
npm install
npm run dev
```

The [docs](docs/README.md) say how the app works, and
[docs/development.md](docs/development.md) where things are. Signing in to an account
(Settings, Account) needs Enclose's server running beside the app: `npm install` and
`npm run dev` in `apps/cloud`
([The account server](docs/development.md#the-account-server)).

## Before you open a pull request

```
npm run typecheck
npm run lint
npm test
npm run format      # .ts and .tsx only
```

- One change to a pull request.
- What can be tested has a test beside it (`name.test.ts` next to `name.ts`): add to
  them, or change them, with what you change.
- Write as the code round your change is written. Comments say why a thing is so, in
  plain words.
- Commit messages follow the history: `feat(view): ...`, `fix(chat): ...`.
- Where your change makes the README or a page in `docs/` wrong, change that with it.
- A theme is a pull request of its own: the one file the theme creator writes in
  `themes/` ([Themes](docs/settings.md#themes)), and nothing else.
- Leave `examples/` and `apps/desktop/shared/examples.json` as they are. The examples are published
  as archives, and a change to one means a new release of them.

## Reporting a problem

Open an issue that says what you did, what you expected and what happened, with your
system and the app's version (Settings shows it). A model that shows the problem helps
more than anything, if it is one you can share.

## What you agree to

Enclose is licensed under the GNU Affero General Public License, version 3 (see
[LICENSE](LICENSE) and [NOTICE.md](NOTICE.md)). By sending a contribution you say
that it is yours to give, and you license it to the project and everyone who gets it
under those same terms. Do not bring in code, models or pictures whose terms do not
allow that, and say where anything that is not your own comes from.
