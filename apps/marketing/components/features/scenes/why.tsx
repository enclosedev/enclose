import {
  CheckIcon,
  ChevronDownIcon,
  CornerLeftUpIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PinIcon,
  PlusIcon,
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Collapse } from '../../stageshow/motion/Collapse'
import type { Act } from '../../stageshow/act'
import { ClaudeIcon } from '../../app/icons'
import { Composer, CORNER, Model, ProjectCard, Round, Scene, type News } from '../fx'
import { GitHubIcon, GrokIcon, OpenAIIcon, OpencodeIcon } from './marks'
import './why.scss'

// Why Enclose: the window round the model. Its projects, their conversations and
// versions, where they are kept, and whose agent does the work.

// ── Every project in view ──────────────────────────────────────────────────
// The sidebar of four projects over the view. The arm's agent finishes; the clock's
// is waiting on you, and is turned to, and then the stool, and the arm again: each
// time the view has that project's model.

type Project = 'arm' | 'clock' | 'lamp' | 'stool'
type ProjectsState = { open: Project; arm: News | null; lamp: News | null }

const PROJECTS: { id: Project; name: string; said: string; when?: string; group?: { name: string; pinned?: boolean } }[] = [
  { id: 'arm', name: 'Robot arm', said: 'Added a tool that steers the arm, joint by joint.', when: '1 min', group: { name: 'Robot arm', pinned: true } },
  { id: 'clock', name: 'Table clock', said: 'Should the hands be brass, or black like the dial?', group: { name: 'Table clock' } },
  { id: 'lamp', name: 'Clip lamp', said: 'Lengthened the wire to 1.8 m, and moved the clip.', when: '2 h', group: { name: 'Home' } },
  { id: 'stool', name: 'Counter stool', said: 'Raised the seat to 65 cm, and the footrest with it.', when: 'Mon' },
]

const projectsStart: ProjectsState = { open: 'arm', arm: 'working', lamp: null }

async function projectsScript(a: Act<ProjectsState>) {
  await a.wait(2200)
  await a.set({ arm: 'done' })
  await a.wait(900)
  await a.click('card-clock')
  await a.set({ open: 'clock' })
  await a.wait(2000)
  await a.click('card-stool')
  await a.set({ open: 'stool' })
  await a.wait(1800)
  await a.click('card-arm')
  // turned to, what it had done is seen: it is no longer news
  await a.set({ open: 'arm', arm: null })
  await a.wait(1600)
  // and it is asked for something more
  await a.set({ arm: 'working' })
  await a.wait(600)
}

function Projects() {
  return (
    <Scene<ProjectsState>
      className="fx-projects"
      initial={projectsStart}
      poster={{ open: 'clock', arm: 'done', lamp: null }}
      script={projectsScript}
      cursor={{ at: { wide: { x: 470, y: 400 }, compact: { x: 300, y: 380 } } }}
    >
      {(s) => (
        <>
          <div className="fx-projects__view">
            <Model src="arm" className="fx-projects__arm" shown={s.open === 'arm'} />
            <Model src="example-clock" className="fx-projects__example" shown={s.open === 'clock'} />
            <Model src="example-lamp" className="fx-projects__example" shown={s.open === 'lamp'} />
            <Model src="example-stool" className="fx-projects__example" shown={s.open === 'stool'} />
          </div>
          <div className="fx-projects__sidebar">
            {PROJECTS.map((project) => [
              project.group && <GroupHeading key={`group-${project.id}`} {...project.group} />,
              <ProjectCard
                key={project.id}
                target={`card-${project.id}`}
                name={project.name}
                said={project.said}
                when={project.when}
                lit={s.open === project.id}
                news={
                  project.id === 'arm'
                    ? s.arm
                    : project.id === 'lamp'
                      ? s.lamp
                      : project.id === 'clock'
                        ? 'asking'
                        : null
                }
              />,
            ])}
          </div>
          <Round on style={{ position: 'absolute', top: CORNER, right: CORNER }}>
            <MessageSquareIcon />
          </Round>
        </>
      )}
    </Scene>
  )
}

// ── Little pieces of the sidebar these cards share ────────────────────────

/**
 * A group's heading, over its projects' cards: its name, a rule, and + and pin (filled,
 * pinned to the top). Every project is in a group, a group of one going by its name.
 */
function GroupHeading({ name, pinned }: { name: string; pinned?: boolean }) {
  return (
    <div className="fx-heading">
      <span>{name}</span>
      <i />
      <PlusIcon />
      <PinIcon fill={pinned ? 'currentColor' : 'none'} />
    </div>
  )
}

/** An earlier conversation of a project, spread out under its card. */
function Earlier({ first, children }: { first?: boolean; children: ReactNode }) {
  return (
    <div className="fx-earlier">
      <span className="fx-earlier__back">{first && <CornerLeftUpIcon />}</span>
      {children}
    </div>
  )
}

// ── A version for each conversation ───────────────────────────────────────
// The arm's project, with its two earlier conversations spread out under it, each
// on a branch of its own. Turned to, each has the model as it left it: white all
// over, then standing raised, then back to where the project is now.

type Version = 'main' | 'white' | 'raised'
type VersionsState = { open: Version }

async function versionsScript(a: Act<VersionsState>) {
  await a.wait(1400)
  await a.click('version-white')
  await a.set({ open: 'white' })
  await a.wait(2400)
  await a.click('version-raised')
  await a.set({ open: 'raised' })
  await a.wait(2400)
  await a.click('version-main')
  await a.set({ open: 'main' })
  await a.wait(1600)
}

function Versions() {
  return (
    <Scene<VersionsState>
      className="fx-versions"
      initial={{ open: 'main' }}
      poster={{ open: 'white' }}
      script={versionsScript}
      cursor={{ at: { wide: { x: 480, y: 410 }, compact: { x: 300, y: 390 } } }}
    >
      {(s) => (
        <>
          <Model src="arm" className="fx-versions__arm" shown={s.open === 'main'} />
          <Model src="arm-white" className="fx-versions__arm" shown={s.open === 'white'} />
          <Model src="arm-raised" className="fx-versions__raised" shown={s.open === 'raised'} />
          <div className="fx-versions__sidebar">
            <GroupHeading name="Robot arm" pinned />
            <ProjectCard
              target="version-main"
              name="Robot arm"
              said="Added a tool that steers each joint."
              when="1 min"
              branch="main"
              lit={s.open === 'main'}
            />
            <Earlier first>
              <ProjectCard
                target="version-white"
                name="All in white"
                said="White all over, with the shoulder in orange."
                when="2 h"
                branch="version/all-in-white"
                lit={s.open === 'white'}
              />
            </Earlier>
            <Earlier>
              <ProjectCard
                target="version-raised"
                name="Reaching up"
                said="Stands raised, as it would to reach a shelf."
                when="Mon"
                branch="version/reaching-up"
                lit={s.open === 'raised'}
              />
            </Earlier>
          </div>
          <Round on style={{ position: 'absolute', top: CORNER, right: CORNER }}>
            <MessageSquareIcon />
          </Round>
        </>
      )}
    </Scene>
  )
}

// ── Projects that go together ─────────────────────────────────────────────
// A group of two projects, the arm and its gripper, and another group under it. The
// arm's agent widens the wrist mount, and hands the gripper's side of it over: the
// gripper's card takes it up, with what it was handed. Turned to, it has finished.

type GroupsState = {
  open: 'arm' | 'gripper'
  arm: News | null
  /** the arm's card: what was asked, or what came of it */
  armDone: boolean
  gripper: News | null
  /** the gripper's card: handed the change, or done with it */
  handed: boolean
}

const groupsStart: GroupsState = { open: 'arm', arm: 'working', armDone: false, gripper: null, handed: false }

async function groupsScript(a: Act<GroupsState>) {
  await a.wait(2000)
  await a.set({ arm: 'done', armDone: true })
  await a.wait(1100)
  a.mark('handed')
  await a.set({ gripper: 'working', handed: true })
  await a.wait(1800)
  await a.click('group-gripper')
  await a.set({ open: 'gripper', arm: null })
  await a.wait(1600)
  await a.set({ gripper: null, handed: false })
  await a.wait(1800)
  await a.click('group-arm')
  // and the arm is asked for more
  await a.set({ open: 'arm', arm: 'working', armDone: false })
  await a.wait(500)
}

function Groups() {
  return (
    <Scene<GroupsState>
      className="fx-groups"
      initial={groupsStart}
      poster={{ open: 'arm', arm: 'done', armDone: true, gripper: 'working', handed: true }}
      script={groupsScript}
      cursor={{ at: { wide: { x: 470, y: 420 }, compact: { x: 300, y: 390 } } }}
    >
      {(s) => (
        <>
          <Model src="arm" className="fx-groups__arm" shown={s.open === 'arm'} />
          <Model src="gripper" className="fx-groups__gripper" shown={s.open === 'gripper'} />
          <div className="fx-groups__sidebar">
            <GroupHeading name="SO-101 arm" pinned />
            <ProjectCard
              target="group-arm"
              name="Arm"
              said={
                s.armDone
                  ? 'Widened the wrist mount, and handed the gripper its side.'
                  : 'Widen the wrist mount to 28 mm, for the new servo.'
              }
              news={s.arm}
              lit={s.open === 'arm'}
            />
            <ProjectCard
              target="group-gripper"
              name="Gripper"
              said={
                s.handed ? (
                  <>
                    <b className="fx-groups__from">From Arm:</b> the wrist mount is 28 mm now.
                  </>
                ) : (
                  'Fitted its mount to the arm’s new wrist.'
                )
              }
              when="1 h"
              news={s.gripper}
              lit={s.open === 'gripper'}
            />
            <GroupHeading name="Kitchen" />
            <ProjectCard name="Counter stool" said="Raised the seat to 65 cm, and the footrest with it." when="Mon" />
          </div>
          <Round on style={{ position: 'absolute', top: CORNER, right: CORNER }}>
            <MessageSquareIcon />
          </Round>
        </>
      )}
    </Scene>
  )
}

// ── Backed up to GitHub ───────────────────────────────────────────────────
// The arm's agent finishes its turn, and the turn is a commit on the project's own
// private repository, saying what it changed, as GitHub lists it. (A version's
// commits are on its own branch.) After a while the new commit hands back.

type GithubState = { done: boolean; pushed: boolean }

async function githubScript(a: Act<GithubState>) {
  await a.wait(1800)
  await a.set({ done: true })
  await a.wait(700)
  a.mark('pushed')
  await a.set({ pushed: true })
  await a.wait(3600)
  // the list gives back what the loop added, in one motion, and the turn is asked again
  await a.set({ pushed: false, done: false })
  await a.wait(900)
}

const COMMITS = [
  { title: 'Changed: the cables lie at rest', when: '2 hours ago', branch: 'main' },
  { title: 'Recolored parts by hand', when: '3 hours ago', branch: 'version/all-in-white' },
  { title: 'Fixed: the jaw no longer clips', when: 'yesterday', branch: 'main' },
]

function Commit({ title, when, branch, fresh }: { title: string; when: string; branch: string; fresh?: boolean }) {
  return (
    <div className="fx-commit" data-fresh={fresh || undefined}>
      <span className="fx-commit__dot" />
      <span className="fx-commit__words">
        <span className="fx-commit__title">{title}</span>
        <span className="fx-commit__meta">
          {when}
          <span className="fx-commit__branch">
            <GitBranchIcon />
            {branch}
          </span>
        </span>
      </span>
    </div>
  )
}

function Github() {
  return (
    <Scene<GithubState>
      className="fx-github"
      initial={{ done: false, pushed: false }}
      poster={{ done: true, pushed: true }}
      script={githubScript}
    >
      {(s) => (
        <>
          <Model src="arm" className="fx-github__arm" />
          <div className="fx-github__sidebar">
            <GroupHeading name="Robot arm" pinned />
            <ProjectCard
              name="Robot arm"
              said={s.done ? 'Added a slider for each joint, and three poses.' : 'Make a slider for each joint, and a few poses.'}
              news={s.done ? null : 'working'}
              when="now"
              lit
            />
          </div>
          <div className="fx-github__repo">
            <header>
              <GitHubIcon />
              <span className="fx-github__name">enclose-robot-arm</span>
              <span className="fx-github__private">Private</span>
            </header>
            <div className="fx-github__bar">
              <span className="fx-github__select">
                <GitBranchIcon />
                main
                <ChevronDownIcon />
              </span>
              <span>Commits</span>
            </div>
            <div className="fx-github__list">
              <Collapse open={s.pushed} reveal="drop">
                <Commit title="Added: a slider for each joint" when="just now" branch="main" fresh />
              </Collapse>
              {COMMITS.map((commit) => (
                <Commit key={commit.title} {...commit} />
              ))}
              <div className="fx-commit fx-commit--filler">
                <span className="fx-commit__dot" />
                <span className="fx-commit__words">
                  <i style={{ width: 210 }} />
                  <i style={{ width: 120 }} />
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </Scene>
  )
}

// ── The agent you already pay for ─────────────────────────────────────────
// The line under the message says how it will be answered. Pressed, it opens the
// agents' marks over the three choices: which model, how hard it thinks, and what it
// may do without asking. Codex is picked, and thinks harder; and then Claude again.

type Provider = 'claude' | 'codex' | 'grok' | 'opencode'
type AgentsState = { open: boolean; provider: Provider; efforts: boolean; effort: string }

const agentsStart: AgentsState = { open: false, provider: 'claude', efforts: false, effort: 'High' }

const MARKS: { id: Provider; icon: ReactNode; name: string }[] = [
  { id: 'claude', icon: <ClaudeIcon />, name: 'Claude Code' },
  { id: 'codex', icon: <OpenAIIcon />, name: 'Codex' },
  { id: 'grok', icon: <GrokIcon />, name: 'Grok' },
  { id: 'opencode', icon: <OpencodeIcon />, name: 'opencode' },
]
const MODEL: Record<Provider, string> = {
  claude: 'Opus 5.5',
  codex: 'GPT-5.5',
  grok: 'Grok 4.3',
  opencode: 'Default',
}
const EFFORTS = ['Low', 'Medium', 'High', 'Extra high']

async function agentsScript(a: Act<AgentsState>) {
  await a.wait(900)
  await a.click('using')
  await a.set({ open: true })
  await a.wait(700)
  await a.click('mark-codex')
  await a.set({ provider: 'codex' })
  await a.wait(600)
  await a.click('effort')
  await a.set({ efforts: true })
  await a.wait(400)
  await a.click('effort-xhigh')
  await a.set({ efforts: false, effort: 'Extra high' })
  await a.wait(600)
  await a.click('away')
  await a.set({ open: false })
  a.mark('picked')
  await a.wait(2600)
  // and back to Claude, as the next conversation has it
  await a.click('using')
  await a.set({ open: true })
  await a.wait(500)
  await a.click('mark-claude')
  await a.set({ provider: 'claude', effort: 'High' })
  await a.wait(500)
  await a.click('away')
  await a.set({ open: false })
  await a.wait(900)
}

function Agents() {
  return (
    <Scene<AgentsState>
      className="fx-agents"
      initial={agentsStart}
      poster={{ open: true, provider: 'codex', efforts: false, effort: 'Extra high' }}
      script={agentsScript}
      cursor={{ at: { wide: { x: 300, y: 300 }, compact: { x: 200, y: 200 } } }}
    >
      {(s) => {
        const mark = MARKS.find((one) => one.id === s.provider)!
        return (
          <>
            <Model src="arm" className="fx-agents__arm" />
            <aside className="fx-thread fx-agents__thread">
              <header>New conversation</header>
              {/* a conversation with nothing in it yet, as the app has one */}
              <div className="fx-agents__empty" data-target="away">
                <strong>Ask the agent about this model</strong>
                <span>Describe a change, or click a part in the view and say what it should become.</span>
              </div>
              <div className="fx-agents__foot">
                <div className="fx-agents__pop" data-on={s.open || undefined}>
                  <div className="fx-agents__marks">
                    {MARKS.map((one) => (
                      <span
                        key={one.id}
                        className="fx-agents__mark"
                        data-on={s.provider === one.id || undefined}
                        data-target={`mark-${one.id}`}
                        data-cursor="pointer"
                      >
                        {one.icon}
                      </span>
                    ))}
                  </div>
                  <div className="fx-agents__choices">
                    <span className="fx-agents__choice">
                      {MODEL[s.provider]}
                      <ChevronDownIcon />
                    </span>
                    <span className="fx-agents__choice" data-target="effort" data-cursor="pointer">
                      {s.effort}
                      <ChevronDownIcon />
                    </span>
                    <span className="fx-agents__choice">
                      Full access
                      <ChevronDownIcon />
                    </span>
                  </div>
                  <div className="fx-menu fx-agents__efforts" data-on={s.efforts || undefined}>
                    <div className="fx-menu__label">How hard {mark.name === 'Claude Code' ? 'Claude' : mark.name} thinks</div>
                    {EFFORTS.map((effort) => (
                      <div
                        key={effort}
                        className="fx-menu__item"
                        data-target={effort === 'Extra high' ? 'effort-xhigh' : undefined}
                      >
                        <span className="fx-agents__tick">{s.effort === effort && <CheckIcon />}</span>
                        {effort}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="fx-agents__composer">
                  <Composer
                    typed="Make a slider for each joint"
                    icon={mark.icon}
                    using={
                      <span data-target="using" data-cursor="pointer">
                        {MODEL[s.provider]}, {s.effort}, Full access
                      </span>
                    }
                  />
                </div>
              </div>
            </aside>
          </>
        )
      }}
    </Scene>
  )
}

export const WHY: Record<string, ComponentType> = {
  projects: Projects,
  versions: Versions,
  groups: Groups,
  github: Github,
  agents: Agents,
}

