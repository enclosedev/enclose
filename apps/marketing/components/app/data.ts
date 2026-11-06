// What the app's window on the page is filled with: the projects of someone who has
// had the app for months, and the conversation about the one that is open.

/** The window as it is drawn, in px, before the page scales it. */
export const WINDOW = { width: 1720, height: 1000, thread: 460 }

export type Conversation = {
  title: string
  /** when it was last carried on, as the app says it: "12h", "3d" */
  when: string
  said: string
}

export type Project = {
  id: string
  name: string
  when?: string
  said: string
  /** the branch its folder is on, where the folder is kept in git */
  branch?: string
  /** what there is to say of its conversation, in place of when it was */
  news?: 'working' | 'asking' | 'done'
  /** conversations had before, under its card */
  under?: Conversation[]
}

/**
 * Projects kept together, under a heading with the group's name: as the app lists them,
 * each project in a group, a group of one going by its project's name. The pinned are
 * at the top.
 */
export type Group = { name: string; pinned?: boolean; projects: Project[] }

export const OPEN = 'arm'

export const GROUPS: Group[] = [
  {
    name: 'Robot arm',
    pinned: true,
    projects: [
      {
        id: 'arm',
        name: 'Robot arm',
        when: '12h',
        said: 'Assistant reports new Routine tab: arm mimes activities over an empty table.',
      },
      {
        id: 'mount',
        name: 'Camera mount',
        said: 'Moving the camera 12 mm back, clear of the jaw.',
        news: 'working',
      },
    ],
  },
  {
    name: 'Table clock',
    pinned: true,
    projects: [
      {
        id: 'clock',
        name: 'Table clock',
        when: '12h',
        said: 'The base is white now; I left the feet under it dark.',
        under: [
          {
            title: 'What is this for? Maybe remove it',
            when: '12h',
            said: 'Assistant reports removed Spring readout, Wind slider and the barrel’s click.',
          },
          {
            title: 'Thinner bezel',
            when: '6d',
            said: 'The bezel is 2 mm across now, and the glass sits flush with it.',
          },
        ],
      },
    ],
  },
  {
    name: 'Clip lamp',
    projects: [
      {
        id: 'lamp',
        name: 'Clip lamp',
        when: '2d',
        said: 'The shade tips 40° either way now, and the wire has the slack for it.',
        branch: 'wider-clip',
      },
    ],
  },
  {
    name: 'Sensor enclosure',
    projects: [
      {
        id: 'enclosure',
        name: 'Sensor enclosure',
        said: 'Which side should the USB-C port come out of?',
        news: 'asking',
      },
    ],
  },
  {
    name: 'Counter stool',
    projects: [
      {
        id: 'stool',
        name: 'Counter stool',
        when: '3d',
        said: 'The seat is 650 mm up now, the height counters are sold at.',
      },
    ],
  },
]

export type Item =
  | { kind: 'said'; text: string; part?: string }
  | { kind: 'worked'; took: string }
  | { kind: 'reply'; text: string; details?: boolean }

export const TITLE =
  'Let’s add a new tool to this project where the robot simulates a number of coordinated activities'

/** The conversation about the arm, from the day its file was opened. */
export const THREAD: Item[] = [
  { kind: 'said', text: 'What do you make of this file?' },
  { kind: 'worked', took: '2m 4s' },
  {
    kind: 'reply',
    text: 'It is the SO-101, an open-source arm with six joints: a base, a shoulder, an upper and a lower arm, a wrist, and a gripper with one jaw that moves. I named its 136 parts and grouped them by the link each one rides on.',
  },
  { kind: 'said', part: 'Jaw', text: 'How far can this open?' },
  { kind: 'worked', took: '48s' },
  {
    kind: 'reply',
    text: 'It is built 20° open. Its joint has room to go to 105° before the horn meets the gripper’s body.',
  },
  {
    kind: 'said',
    text: 'Make a tool that steers each joint with a slider, and a few poses to send it to.',
  },
  { kind: 'worked', took: '5m 31s' },
  {
    kind: 'reply',
    text: 'There is an Arm tab in the Tools panel: a slider for each joint, and Rest, Ready and Reach take the arm to a pose. The cables are drawn where they lie at rest, so I put them out of sight while the arm is moved.',
    details: true,
  },
  {
    kind: 'said',
    text: 'Let’s add a new tool to this project where the robot simulates a number of coordinated activities. Add a slider for the number of activities from 3 to 10',
  },
  { kind: 'worked', took: '7m 16s' },
  {
    kind: 'reply',
    text: 'There is a new Routine tab in the Tools panel, running now: the arm works through a list of activities in a loop, and the Activities slider (3 to 10) sets how many of them it does. I took "activities" to mean things like waving, pick and place, and stirring. The model has nothing for the arm to hold, so it mimes them over an empty table.',
    details: true,
  },
]

/** What is written in the message box as the page is scrolled, and sent. */
export const TYPED = { part: 'Jaw', text: 'Make the fingers 6 mm longer' }

export const PLACEHOLDER = 'Ask anything, @tag parts, $use skills or / for commands'

/** The buttons down the edge of the view, in the app's order, with their keys. */
export const SWITCHES = [
  { id: 'parts', label: 'Parts', key: 'P' },
  { id: 'grid', label: 'Grid', key: '⇧G' },
  { id: 'section', label: 'Section', key: 'S' },
  { id: 'explode', label: 'Explode', key: 'E' },
  { id: 'reference', label: 'Reference', key: '⌘/' },
  { id: 'pcb', label: 'PCB', key: '⇧P' },
  { id: 'blueprint', label: 'Blueprint', key: 'B' },
  { id: 'assembly', label: 'Assembly', key: 'A' },
  { id: 'inspiration', label: 'Inspiration Board', key: '⇧I' },
  { id: 'search', label: 'Search', key: '⌘F' },
  { id: 'tools', label: 'Tools', key: 'T' },
] as const

export type SwitchId = (typeof SWITCHES)[number]['id']

/**
 * The list of parts: the groups the arm's parts are in, in the model's order, and of
 * each the parts its row has room to begin with. The sizes are those of the files in
 * examples/arm/build, a group's being all of its parts' together.
 */
export const PARTS = [
  {
    id: 'base',
    label: 'Base',
    size: '10.6 MB',
    parts: [
      { id: 'base', label: 'Base', size: '629 kB' },
      { id: 'base-motor-holder', label: 'Base motor holder', size: '239 kB' },
      { id: 'board-mount', label: 'Board mount', size: '41 kB' },
    ],
  },
  {
    id: 'shoulder',
    label: 'Shoulder',
    size: '2.8 MB',
    parts: [
      { id: 'shoulder', label: 'Shoulder', size: '407 kB' },
      { id: 'shoulder-motor-holder', label: 'Shoulder motor holder', size: '246 kB' },
      { id: 'servo-2-case', label: 'Servo 2 case', size: '80 kB' },
    ],
  },
  {
    id: 'upper-arm',
    label: 'Upper arm',
    size: '2.7 MB',
    parts: [
      { id: 'upper-arm', label: 'Upper arm', size: '522 kB' },
      { id: 'servo-3-case', label: 'Servo 3 case', size: '80 kB' },
      { id: 'servo-3-top', label: 'Servo 3 top cover', size: '256 kB' },
    ],
  },
  {
    id: 'lower-arm',
    label: 'Lower arm',
    size: '3.0 MB',
    parts: [
      { id: 'lower-arm', label: 'Lower arm', size: '579 kB' },
      { id: 'wrist-motor-holder', label: 'Wrist motor holder', size: '233 kB' },
      { id: 'servo-4-case', label: 'Servo 4 case', size: '80 kB' },
    ],
  },
  {
    id: 'wrist',
    label: 'Wrist',
    size: '2.9 MB',
    parts: [
      { id: 'wrist', label: 'Wrist', size: '789 kB' },
      { id: 'servo-5-case', label: 'Servo 5 case', size: '80 kB' },
      { id: 'servo-5-top', label: 'Servo 5 top cover', size: '255 kB' },
    ],
  },
  {
    id: 'gripper',
    label: 'Gripper',
    size: '2.6 MB',
    parts: [
      { id: 'gripper', label: 'Gripper', size: '642 kB' },
      { id: 'servo-6-case', label: 'Servo 6 case', size: '80 kB' },
      { id: 'servo-6-top', label: 'Servo 6 top cover', size: '256 kB' },
    ],
  },
  {
    id: 'jaw',
    label: 'Jaw',
    size: '1.8 MB',
    parts: [
      { id: 'jaw', label: 'Jaw', size: '531 kB' },
      { id: 'servo-6-shaft', label: 'Servo 6 shaft', size: '645 kB' },
      { id: 'servo-6-horn', label: 'Servo 6 horn', size: '127 kB' },
    ],
  },
  {
    id: 'cables',
    label: 'Cables',
    size: '6.7 MB',
    parts: [
      { id: 'cable-1', label: 'Cable 1', size: '1.0 MB' },
      { id: 'cable-2', label: 'Cable 2', size: '1.4 MB' },
      { id: 'cable-3', label: 'Cable 3', size: '1.3 MB' },
    ],
  },
] as const

/** The group that is picked in the list as the page is scrolled, and shown on its own. */
export const PICKED = 'gripper'

/** What the arm mimes, in the order its routine goes through them. */
export const ACTIVITIES = [
  'Waving',
  'Pick and place',
  'Stirring',
  'Pouring',
  'Sorting',
  'Wiping',
  'Stacking',
  'Pointing',
  'Drawing a circle',
  'Taking a bow',
]

/** The sheets shown of the ten the app draws, by their files in public/blueprint. */
export const SHEETS = [
  { name: 'Top Left', file: 'top-left.svg' },
  { name: 'Top Right', file: 'top-right.svg' },
  { name: 'Front', file: 'front.svg' },
  { name: 'Top', file: 'top.svg' },
  { name: 'Right', file: 'right.svg' },
]
