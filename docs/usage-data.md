# Usage data

Enclose counts how it is used, so that what is worked on next is what people use. The
installed app sends that count to [PostHog](https://posthog.com). Run from a checkout,
it sends nothing.

The app needs no account, and what it sends is tied to none. It goes under a name made
up for your installation, a random one, the first time the app is run.

## What is sent

Each thing counted is an event: its name, and a few words and numbers that say which.

| Event | What goes with it |
|---|---|
| `app opened` | |
| `project added` | Whether it was new, an example, CAD files or a folder; which example; how many CAD files |
| `project removed` | |
| `message sent` | The agent, its model, the effort and the permissions; whether it began a conversation; how many notes on parts, quotes, parts called on by name and pictures went with it; whether it was about a reference scene, or written with a circuit board on screen |
| `model looked over` | The agent, its model, the effort and the permissions |
| `version begun` | The agent, its model, the effort and the permissions |
| `change turned back` | Whether it was undone or redone |
| `model saved` | Whether as CAD files or as drawings; for STL or OBJ, which; and how many |
| `assembly guide asked for` | The agent, its model, the effort and the permissions; whether it was of the whole model |
| `assembly guide written` | How many steps |
| `assembly guide opened` | |
| `assembly guide saved` | How many steps |
| `board saved` | Whether its Gerbers or its STEP file |
| `board made` | Of a board made in detail in the background: the agent, its model, the effort and the permissions; whether it was done, stopped or failed; how long it took, in minutes, and how long it was at each of its steps all told (placing its parts, connecting them, routing, checking), and how many times it went back to an earlier one; how many things the agent did, and how many times the board was built; whether it was made from a rough one, and whether it was finished; and how many parts, nets, connections, vias, layers of copper and pieces of artwork it has |
| `assembly guide removed` | |
| `feature used` | Which of these the view was put into: a section, the exploded view, parts shown alone, parts hidden, the blueprint, the assembly guides, a reference scene, a project's own tools, a circuit board in PCB mode, or the inspiration board; and in PCB mode, a board's technical view, its schematic, a layer of its copper under the top, or the hand it is shown on in 3D. Each is counted once for a run of the app |
| `provider switched` | Which agent, and whether on or off |
| `provider updated` | Which agent, and what came of it: updated, the same as it was, failed, or not answering after |
| `update fetched` | The version |
| `github connected` | |
| `github disconnected` | |

With every event go the app's version, whether it is the installed app, your system
(macOS, its version, and the kind of processor), and the name made up for your
installation. PostHog keeps what it is sent in the United States. It sees the address an
event comes from, as any server does, and works out roughly where that is: a country and
a city.

## What is not

Nothing of a project: not its name, its files, or where it is kept. Nothing said in a
message or in an answer to one. Nothing of what a part, a group or a conversation is
called. A model is counted by its name only where it is one of its makers' (Claude's,
OpenAI's for Codex, xAI's for Grok, and for opencode its own and the big providers'):
one you wrote in yourself, or one from a config of your own, is counted as `custom`.

## Switching it off

Settings, General, Usage data. Switched off, nothing more is counted, and what was
waiting to be sent is not sent.

The name made up for your installation is in `analytics-id`, in
`~/Library/Application Support/Enclose`. Delete it, and the app makes up another the
next time it has something to send.
