import { ArrowUpIcon, GitBranchIcon, PaperclipIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
// (each part of the kit from its own file: its index brings every part's CSS)
import { Stage, type StageProps } from '../stageshow/stage'
import { ClaudeIcon } from '../app/icons'
import './fx.scss'

// The pieces of the app that the feature cards are made of: the app's own look, at
// the app's own sizes, as the window on the page has them (components/app), but
// small enough to put one or two in a card. A card is a crop of the app's view, which
// is dark: on it float the cards, buttons and panels the app floats on its view.
//
// Every card is a Stageshow stage (components/stageshow, from benji.org/stageshow):
// a design size it is scaled down from, a script that plays while it is in sight, a
// still for whoever has motion turned down, and a pointer that is drawn.

/** The size every card is designed at, square, and the narrower design a phone gets. */
export const WIDE = { width: 600, height: 600 }
/**
 * How far in from a card's corner the round button in it is, in the design's px: the
 * card's corner is rounded round it (showcase.scss: a button's half and this).
 */
export const CORNER = 14
export const COMPACT = { below: 440, width: 360, height: 360 }

const TOKENS = {
  '--ss-font': "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  '--ss-canvas': '#171717',
  '--ss-surface': '#171717',
  '--ss-well': '#171717',
  '--ss-raised': '#262626',
  '--ss-text': '#a1a1a1',
  '--ss-text-strong': '#fafafa',
  '--ss-accent': '#0f73ff',
} as const

type SceneProps<S> = Omit<StageProps<S>, 'width' | 'height' | 'theme' | 'compact'> & {
  /** a design of its own for a phone, or none: the wide one, scaled */
  compact?: boolean
}

/**
 * A card's stage: the app's dark view, at the cards' size, with its pointer a glass
 * circle, translucent white, as a touch screen's is (fx.scss).
 */
export function Scene<S extends object>({ className, compact = true, cursor, ...props }: SceneProps<S>) {
  return (
    <Stage<S>
      {...WIDE}
      compact={compact ? COMPACT : undefined}
      theme="dark"
      tokens={TOKENS}
      fill
      className={`fx${className ? ` ${className}` : ''}`}
      cursor={cursor && { style: 'circle', ...cursor }}
      {...props}
    />
  )
}

/** The model, drawn as the app draws it (public/renders, made by scripts/renders.ts). */
export function Model({
  src,
  className,
  style,
  shown = true,
}: {
  src: string
  className?: string
  style?: CSSProperties
  shown?: boolean
}) {
  return (
    <img
      className={`fx-model${className ? ` ${className}` : ''}`}
      src={`/renders/${src}.webp`}
      alt=""
      draggable={false}
      style={style}
      data-shown={shown || undefined}
    />
  )
}

export type News = 'working' | 'asking' | 'done'
const NEWS: Record<News, string> = { working: 'Working', asking: 'Needs you', done: 'Done' }

/** A project's card, as the sidebar has it: its name, when, what was last said, and its news. */
export function ProjectCard({
  name,
  said,
  when,
  news,
  lit,
  branch,
  target,
  style,
}: {
  name: ReactNode
  said: ReactNode
  when?: string
  news?: News | null
  lit?: boolean
  branch?: string
  target?: string
  style?: CSSProperties
}) {
  return (
    <div
      className="fx-card"
      data-lit={lit || undefined}
      data-news={news || undefined}
      data-target={target}
      data-cursor={target ? 'pointer' : undefined}
      style={style}
    >
      <span className="fx-card__written">
        <span className="fx-card__named">
          <span className="fx-card__name">{name}</span>
          {when && <span className="fx-card__when">{when}</span>}
        </span>
        <span className="fx-card__said">{said}</span>
        {branch && (
          <span className="fx-card__branch">
            <GitBranchIcon strokeWidth={1.5} />
            <span>{branch}</span>
          </span>
        )}
      </span>
      {(['working', 'asking', 'done'] as News[]).map((one) => (
        <span key={one} className={`fx-news fx-news--${one}`} data-on={news === one || undefined}>
          {NEWS[one]}
        </span>
      ))}
    </div>
  )
}

/** One of the round buttons down the view's edge, with the tip that comes up beside it. */
export function Round({
  children,
  on,
  tool,
  tip,
  keys,
  showTip,
  target,
  plain,
  style,
}: {
  children: ReactNode
  on?: boolean
  tool?: boolean
  tip?: string
  keys?: string
  showTip?: boolean
  target?: string
  plain?: boolean
  style?: CSSProperties
}) {
  return (
    <span
      className={`fx-round${tool ? ' fx-round--tool' : ''}${plain ? ' fx-round--plain' : ''}`}
      data-on={on || undefined}
      data-target={target}
      data-cursor={target ? 'pointer' : undefined}
      style={style}
    >
      {children}
      {tip && (
        <span className="fx-tip" data-on={showTip || undefined}>
          {tip}
          {keys && <kbd>{keys}</kbd>}
        </span>
      )}
    </span>
  )
}

/** The message box at the foot of the conversation. */
export function Composer({
  chips,
  typed,
  placeholder = 'Ask for changes…',
  using = 'Opus 5.5, High, Full access',
  icon = <ClaudeIcon />,
  ready,
  target,
}: {
  chips?: ReactNode
  typed?: string
  placeholder?: string
  using?: ReactNode
  icon?: ReactNode
  ready?: boolean
  target?: string
}) {
  return (
    <div className="fx-composer">
      {chips && <div className="fx-composer__chips">{chips}</div>}
      <div className="fx-composer__write" data-target={target} data-cursor={target ? 'ibeam' : undefined}>
        {typed ? (
          <span className="fx-composer__typed">{typed}</span>
        ) : (
          <span className="fx-composer__placeholder">{placeholder}</span>
        )}
      </div>
      <div className="fx-composer__under">
        <span className="fx-composer__using">
          {icon}
          <span>Using {using}</span>
        </span>
        <PaperclipIcon />
        <span className="fx-send" data-on={ready || typed ? true : undefined} data-target="send">
          <ArrowUpIcon />
        </span>
      </div>
    </div>
  )
}

/** A pill along the foot of the view: a switch, a choice, a button. */
export function Pill({ children, target, style }: { children: ReactNode; target?: string; style?: CSSProperties }) {
  return (
    <span className="fx-pill" data-target={target} data-cursor={target ? 'pointer' : undefined} style={style}>
      {children}
    </span>
  )
}

/** The app's switch. */
export function Switch({ on, tool }: { on?: boolean; tool?: boolean }) {
  return <i className={`fx-switch${tool ? ' fx-switch--tool' : ''}`} data-on={on || undefined} />
}
