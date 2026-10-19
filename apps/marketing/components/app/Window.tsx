import {
  ArrowUpIcon,
  BookOpenIcon,
  BoxIcon,
  BoxesIcon,
  ChevronDownIcon,
  CornerLeftUpIcon,
  DownloadIcon,
  DraftingCompassIcon,
  GitBranchIcon,
  Grid3x3Icon,
  HammerIcon,
  MessageSquareIcon,
  PanelRightCloseIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UnfoldVerticalIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { drawMark, GIZMO, GIZMO_PARTS } from '../../shell/axes'
import {
  ACTIVITIES,
  OPEN,
  PARTS,
  PICKED,
  PLACEHOLDER,
  PROJECTS,
  SHEETS,
  SWITCHES,
  THREAD,
  TITLE,
  TYPED,
  type Item,
  type Project,
  type SwitchId,
} from './data'
import { BoardIcon, ClaudeIcon, ReferenceIcon, SectionIcon } from './icons'
import './app.scss'

// The app's window, rebuilt on the page out of what the app itself is built of,
// so that the page can say what is in it: how many projects, what was said, where
// the model is turned to. It is a picture: nothing in it is to be pressed, and
// everything that changes in it is changed by the page's scroll (pages/home/tour.ts),
// which finds its parts by their `data-` names.

const SWITCH_ICON: Record<SwitchId, ReactNode> = {
  parts: <BoxesIcon />,
  grid: <Grid3x3Icon />,
  section: <SectionIcon />,
  explode: <UnfoldVerticalIcon />,
  reference: <ReferenceIcon />,
  pcb: <BoardIcon />,
  blueprint: <DraftingCompassIcon />,
  assembly: <BookOpenIcon />,
  search: <SearchIcon />,
  tools: <HammerIcon />,
}

const NEWS = { working: 'Working', asking: 'Needs you', done: 'Done' }

/** How long an agent has been at work when the page opens, s. */
const AT_WORK = 15

/**
 * Under the word that a card's conversation is being worked on: for how long it has
 * been, which goes up by the clock as it does in the app, and is said as the app
 * says it.
 */
function Going() {
  const [seconds, setSeconds] = useState(AT_WORK)
  useEffect(() => {
    const began = Date.now()
    const timer = setInterval(
      () => setSeconds(AT_WORK + Math.floor((Date.now() - began) / 1000)),
      1000,
    )
    return () => clearInterval(timer)
  }, [])
  if (seconds < 60) return <span>{seconds} s</span>
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return <span>{minutes} min</span>
  const hours = Math.floor(minutes / 60)
  return <span>{minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`}</span>
}

/** Everything written on a card: a name, when, and the last that was said. */
function Written({
  name,
  when,
  said,
  news,
  branch,
  sends,
}: {
  name: string
  when?: string
  said: string
  news?: Project['news']
  branch?: string
  /** its conversation is the one the page's scroll sends a message in: see below */
  sends?: boolean
}) {
  return (
    <>
      <span className={`app__written${news ? ' app__written--news' : ''}`}>
        <span className="app__named">
          <span className="app__name">{name}</span>
          {when && !news && <span className="app__when">{when}</span>}
        </span>
        <span className="app__said">{said}</span>
        {/* the branch, for a folder that is kept in git: a line more on its card */}
        {branch && (
          <span className="app__branch">
            <GitBranchIcon strokeWidth={1.5} />
            <span>{branch}</span>
          </span>
        )}
      </span>
      {news && (
        <span className={`app__news app__news--${news}`}>
          {NEWS[news]}
          {news === 'working' && <Going />}
        </span>
      )}
      {/* What the open project's card says once the scroll has sent its message: that
          the agent is at work, and for how long, which is the time the conversation
          says too. The scroll puts `data-working` on the card, and takes it off. */}
      {sends && (
        <span className="app__news app__news--working" data-app="at-work">
          {NEWS.working}
          <span data-app="at-work-for">0 s</span>
        </span>
      )}
    </>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const under = project.under ?? []
  return (
    <div
      className="app__tuck"
      data-app={project.later ? 'later' : project.id === OPEN ? 'open' : 'other'}
      data-project={project.id}
    >
      <div className="app__tucked">
        <div className="app__project">
          <div
            className={`app__card${project.id === OPEN ? ' app__card--lit' : ''}`}
            data-under={under.length > 0 || undefined}
          >
            <Written {...project} sends={project.id === OPEN} />
            {under.length > 0 && <span className="app__sliver" data-app="sliver" />}
          </div>
          {under.length > 0 && (
            <div className="app__tuck app__tuck--spread" data-app="spread">
              <div className="app__tucked">
                <div className="app__earlier">
                  {under.map((conversation, index) => (
                    <div key={conversation.title} className="app__row" data-app="earlier">
                      <span className="app__back">{index === 0 && <CornerLeftUpIcon />}</span>
                      <div className="app__card">
                        <Written
                          name={conversation.title}
                          when={conversation.when}
                          said={conversation.said}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Message({ item }: { item: Item }) {
  if (item.kind === 'worked')
    return (
      <div className="app__worked">
        Worked for {item.took}
        <ChevronDownIcon />
      </div>
    )
  if (item.kind === 'reply')
    return (
      <div className="app__reply">
        <p>{item.text}</p>
        {item.details && (
          <span className="app__details">
            Details
            <ChevronDownIcon />
          </span>
        )}
      </div>
    )
  return (
    <div className="app__turn">
      {item.part && (
        <span className="app__chip">
          <BoxIcon />
          {item.part}
        </span>
      )}
      <div className="app__bubble">{item.text}</div>
    </div>
  )
}

/** A row of the tools panel: what a control is called, what it does, and the control. */
function Control({
  title,
  says,
  small,
  children,
}: {
  title: string
  says: string
  small?: boolean
  children: ReactNode
}) {
  return (
    <div className={`app__control${small ? ' app__control--small' : ''}`}>
      <div className="app__about">
        <div>{title}</div>
        <div>{says}</div>
      </div>
      <div className="app__set">{children}</div>
    </div>
  )
}

// The window is a picture, to whatever reads the page without looking: so what the app
// sets as a heading is set in <strong> here, and the page's own headings go h1, h2.
export function Window() {
  return (
    <div
      className="app"
      role="img"
      aria-label="The Enclose window: project cards over a 3D view of a robot arm, a column of view tools, and a conversation with the agent beside it."
    >
      <div className="app__inside" inert>
        <div className="app__main">
          <canvas className="app__canvas" data-app="canvas" />

          {/* the model's drawings, which take the view's place */}
          <div className="app__sheets" data-app="sheets">
            <div className="app__row-of-sheets" data-app="sheet-row">
              {SHEETS.map((sheet) => (
                <section key={sheet.file} className="app__sheet" data-app="sheet">
                  <header>
                    <strong>{sheet.name} View</strong>
                    <span className="app__save">
                      <DownloadIcon />
                    </span>
                  </header>
                  <div className="app__paper">
                    <img alt="" data-src={`/blueprint/${sheet.file}`} decoding="async" />
                  </div>
                </section>
              ))}
            </div>
            <div className="app__options" data-app="options">
              <span className="app__bar">
                Exploded
                <i className="app__switch" />
              </span>
              <span className="app__bar">
                Dimensions
                <i className="app__switch app__switch--on" />
              </span>
              <span className="app__bar app__bar--units">
                <b>mm</b>
                <b>in</b>
              </span>
              <span className="app__bar">
                <DownloadIcon />
                Download all SVG
              </span>
            </div>
          </div>

          <div className="app__lights">
            <i />
            <i />
            <i />
          </div>

          <aside className="app__sidebar" data-app="sidebar">
            {PROJECTS.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            <span className="app__round app__round--plain" data-app="add">
              <PlusIcon />
            </span>
          </aside>
          <span className="app__round app__round--plain app__settings">
            <SettingsIcon />
          </span>

          {/* what moves with the conversation's edge: the buttons, their tips, the panel */}
          <div className="app__edge" data-app="edge">
            <span className="app__round app__round--on app__talk" data-app="talk">
              <MessageSquareIcon />
            </span>
            <div className="app__column" data-app="column">
              {SWITCHES.map((item) => (
                <span
                  key={item.id}
                  className={`app__round${item.id === 'tools' ? ' app__round--tool' : ''}`}
                  data-switch={item.id}
                >
                  {SWITCH_ICON[item.id]}
                  <span className="app__tip">
                    {item.label}
                    <kbd>{item.key}</kbd>
                  </span>
                </span>
              ))}
            </div>

            <svg
              className="app__gizmo"
              viewBox="-50 -50 100 100"
              data-app="gizmo"
              dangerouslySetInnerHTML={{ __html: drawMark(GIZMO, GIZMO_PARTS) }}
            />

            {/* What the model is made of: a card for each group its parts are in, and in
                it a row of the group's parts, each a picture with its name and how big
                its file is. The pictures are drawn once the model is there (view.ts). */}
            <div className="app__parts" data-app="parts">
              <div className="app__groups" data-app="groups">
                {PARTS.map((group) => (
                  <section
                    key={group.id}
                    className="app__group"
                    data-app={group.id === PICKED ? 'picked' : undefined}
                  >
                    <header>
                      <strong>{group.label}</strong>
                      <span>{group.size}</span>
                      <DownloadIcon strokeWidth={1.25} />
                    </header>
                    <div className="app__pieces">
                      {group.parts.map((part) => (
                        <div key={part.id} className="app__piece">
                          <span className="app__picture">
                            <img alt="" data-part={part.id} />
                          </span>
                          <span>{part.label}</span>
                          <span>{part.size}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {/* the tools made for this project's model, which are the project's own */}
            <div className="app__panel" data-app="panel">
              <div className="app__tabs">
                <span>Arm</span>
                <span className="app__tab">Routine</span>
              </div>
              <Control title="Activities" says="How many the arm works through.">
                <div className="app__slider" data-app="slider">
                  <div className="app__says">
                    <span data-app="count">3</span>
                  </div>
                  <div className="app__trail">
                    <i />
                  </div>
                </div>
              </Control>
              <Control title="Doing" says="What the arm is miming now." small>
                <span className="app__readout" data-app="doing">
                  {ACTIVITIES[0]}
                </span>
              </Control>
              <Control title="Loop" says="Start over after the last one." small>
                <i className="app__switch app__switch--on app__switch--tool" />
              </Control>
            </div>
          </div>
        </div>

        <aside className="app__thread" data-app="thread">
          <header>
            <strong>{TITLE}</strong>
            <span>
              <PlusIcon />
              <PanelRightCloseIcon />
            </span>
          </header>
          <div className="app__scroll">
            <div className="app__messages" data-app="messages">
              {THREAD.map((item, index) => (
                <Message key={index} item={item} />
              ))}
              {/* what is sent as the page is scrolled, and what comes of it */}
              <div className="app__turn" data-app="sent">
                <span className="app__chip">
                  <BoxIcon />
                  {TYPED.part}
                </span>
                <div className="app__bubble">{TYPED.text}</div>
              </div>
              <div className="app__working" data-app="working">
                <span>
                  Working <span data-app="working-for">0 s</span>
                </span>
              </div>
            </div>
          </div>
          <div className="app__composer">
            <div className="app__box">
              <div className="app__chips" data-app="typed-part">
                <span className="app__chip">
                  <BoxIcon />
                  {TYPED.part}
                </span>
              </div>
              <div className="app__write">
                <span className="app__placeholder" data-app="placeholder">
                  {PLACEHOLDER}
                </span>
                <span className="app__typed" data-app="typed" />
              </div>
              <div className="app__under">
                <span className="app__using">
                  <ClaudeIcon />
                  Using Opus 5.5, High, Full access
                </span>
                <PaperclipIcon />
                <span className="app__send" data-app="send">
                  <ArrowUpIcon />
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
