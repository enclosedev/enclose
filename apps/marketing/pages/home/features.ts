// What the page shows after its first screen: what Enclose does, in groups, and in
// each a row of cards. A card is a piece of the app, rebuilt and set going
// (components/features/scenes), with what it is called and a line on it under it.
// The `scene` names which piece of the app the card shows.

export type Feature = {
  scene: string
  title: string
  says: string
}

export type Group = {
  id: string
  /** what the section says, in one paragraph: this, and then, quieter, `lede` */
  heading: string
  lede: string
  features: Feature[]
}

export const GROUPS: Group[] = [
  {
    id: 'why',
    heading: 'A workbench for things you make with an agent.',
    lede: 'Every project, conversation and version in one window.',
    features: [
      {
        scene: 'projects',
        title: 'Every project in view.',
        says: 'Each card says what its agent is up to: working, done, or waiting on you. Turn to one and its model is in the view.',
      },
      {
        scene: 'versions',
        title: 'A version for each conversation.',
        says: 'Try an idea in a new conversation. It starts from the model on screen, and the one you left keeps its own.',
      },
      {
        scene: 'groups',
        title: 'Projects that go together.',
        says: 'Grouping projects gives the agent their context: when one changes, it carries what that means over to the others.',
      },
      {
        scene: 'github',
        title: 'Backed up to GitHub.',
        says: 'Every turn is a commit that says what changed, and each version has its own branch. Connect GitHub and every project is pushed to a private repository.',
      },
      {
        scene: 'agents',
        title: 'The agent you already pay for.',
        says: 'Claude Code, Codex, Grok or opencode, on your own subscription. Pick the model and the effort for each conversation.',
      },
    ],
  },
  {
    id: 'cad',
    heading: 'Point at the part. Say what should change.',
    lede: "The agent writes the model's code.",
    features: [
      {
        scene: 'notes',
        title: 'A note on every part.',
        says: 'Click a part and say what should change. Leave notes on as many as you like, then send them together.',
      },
      {
        scene: 'paint',
        title: 'Colours and materials.',
        says: 'Give a part a colour, or what it is made of: brushed aluminium, walnut, frosted glass. Cmd+Z takes it back.',
      },
      {
        scene: 'parts',
        title: 'Every part, listed.',
        says: 'The model’s parts in their groups, each with its picture and its file. Pick a group to see it on its own.',
      },
      {
        scene: 'explode',
        title: 'Pulled apart.',
        says: 'Explode the model by its groups, and pull it further apart, to see how it all goes together.',
      },
      {
        scene: 'blueprint',
        title: 'Blueprints, ready to print.',
        says: 'Vector sheets from every side and corner, with dimensions, each part on its own layer of the SVG.',
      },
      {
        scene: 'assembly',
        title: 'Assembly guides.',
        says: 'Ask for a guide and the agent works out the order the parts go on in, and writes the steps, with what you need to hand.',
      },
    ],
  },
  {
    id: 'pcb',
    heading: 'The board that fits the case.',
    lede: 'The agent designs it with tscircuit and leaves room for every plug.',
    features: [
      {
        scene: 'board-3d',
        title: 'In 3D.',
        says: 'See the board as it will be made, look round it as you do the model, and click a part to say something of it.',
      },
      {
        scene: 'board-technical',
        title: 'Technical view.',
        says: 'Each layer of copper, as the board is made. Point at a pad for its pin, or a trace for its net and length.',
      },
      {
        scene: 'board-schematic',
        title: 'The schematic.',
        says: 'How it is wired, drawn as tscircuit draws it. Click a part for its maker’s number, JLCPCB’s, and what is in stock.',
      },
      {
        scene: 'board-agent',
        title: 'Made while you talk.',
        says: 'A board in detail is made in the background: placed, connected, routed. The conversation goes on meanwhile.',
      },
    ],
  },
  {
    id: 'more',
    heading: 'Made to be made yours.',
    lede: "Collect ideas before there's a model, and let the agent build the tools you need.",
    features: [
      {
        scene: 'inspiration',
        title: 'Inspiration board.',
        says: 'Drop in pictures of the look you are after, and pin a note to the detail you mean. The agent designs by them.',
      },
      {
        scene: 'tools',
        title: 'Tools made for your model.',
        says: 'No animation system to learn. Ask, and the agent builds the sliders, switches and poses your model needs.',
      },
      {
        scene: 'reference',
        title: 'Seen at its size.',
        says: 'Set the model on a desk, in a room or beside a person, to see how big it will really be.',
      },
    ],
  },
]
