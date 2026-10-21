import * as React from "react"
import { cn } from "cn"
import { ArrowRightIcon } from "lucide-react"

import {
  pickTab,
  pressControl,
  setControl,
  useTools,
  type Tool,
} from "@/lib/custom-tools/host"
import type { ControlKind } from "@/lib/custom-tools/types"
import { useStore } from "@/lib/store"
import { ControlOf } from "./controls"

/** The line between one thing and the next in the panel, in white on its blue. */
const LINE = "border-white/17"

/**
 * The controls that are small things: a switch, and what a tool says. One of these has
 * no use for the room the others are given: it stands at the far end of its line, and
 * what it is called and does has the rest.
 */
const SMALL: ReadonlySet<ControlKind> = new Set(["toggle", "readout"])

/**
 * A tool that came to nothing: what went wrong in it, in its own words, and the way to
 * have it put right. Nobody writes these by hand: it is said to Claude, which wrote it.
 */
function Broken({ tool, projectId }: { tool: Tool; projectId: string }) {
  const fix = () => {
    const { drafts, setDraft, setThreadOpen } = useStore.getState()
    if (!(drafts[projectId] ?? "").trim())
      setDraft(
        `The ${tool.name} tool (${tool.file}) is not working: ${tool.error}`
      )
    setThreadOpen(true)
    useStore.setState((state) => ({ writeRequests: state.writeRequests + 1 }))
  }
  return (
    <div className="flex flex-col items-start gap-3 p-5 text-sm/[17px]">
      <div>
        <div className="font-medium">This tool stopped working</div>
        <div className="text-pretty text-white/60 select-text">
          {tool.error}
        </div>
      </div>
      <button
        type="button"
        onClick={fix}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-white pr-2.5 pl-3 font-medium text-tool-panel outline-none hover:bg-white/90"
      >
        Fix in chat
        <ArrowRightIcon size={16} absoluteStrokeWidth strokeWidth={1.25} />
      </button>
    </div>
  )
}

/**
 * The project's own tools: what its user had made to work the model with, which are no
 * part of the app. So the panel is blue, as nothing of the app's is. Each tool is a tab
 * across the top, and under it are that tool's controls, one below another: what each
 * is called and does, in a few words, with the control itself beside them.
 *
 * It stays up while the view is turned and the model looked at, since that is what a
 * tool is worked for: the button that brought it up puts it away, and so does Esc. Put
 * away, the tools are still at work on the model, until Esc leaves them too.
 */
export function ToolsPanel({
  projectId,
  className,
}: {
  projectId: string
  className?: string
}) {
  const tools = useTools((state) => state.tools)
  const picked = useTools((state) => state.tab)
  const tool = tools.find((one) => one.id === picked) ?? tools.at(0)
  const tabs = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    tabs.current
      ?.querySelector("[aria-selected=true]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [tool?.id])

  return (
    <div
      role="group"
      aria-label="Tools"
      data-tools-panel
      // a press here works a control, and takes the keys from nowhere: they go on
      // being the view's
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "pointer-events-auto flex w-105 flex-col overflow-hidden rounded-2xl bg-tool-panel text-white shadow-lg ring-1 ring-tool-line select-none",
        className
      )}
    >
      <div
        ref={tabs}
        role="tablist"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX))
            event.currentTarget.scrollLeft += event.deltaY
        }}
        className={cn(
          "flex h-12 shrink-0 [scrollbar-width:none] overflow-x-auto border-b",
          LINE
        )}
      >
        {tools.map((one) => {
          const shown = one === tool
          return (
            <button
              key={one.id}
              type="button"
              role="tab"
              aria-selected={shown}
              onClick={() => pickTab(one.id)}
              className={cn(
                "relative h-full shrink-0 cursor-pointer px-4 text-sm whitespace-nowrap outline-none first:pl-5",
                shown
                  ? // the line under it lies over the one under them all
                    "font-medium after:absolute after:inset-x-0 after:-bottom-px after:h-[1.5px] after:bg-white"
                  : "text-white/60 hover:text-white/85"
              )}
            >
              {one.name}
            </button>
          )
        })}
      </div>
      <div className="flex min-h-0 scroll-fade [scrollbar-width:none] flex-col overflow-y-auto">
        {tool?.error != null ? (
          <Broken tool={tool} projectId={projectId} />
        ) : tool && tool.controls.length === 0 && tool.ready ? (
          <div className="p-5 text-sm/[17px] text-white/60">
            This tool has no controls.
          </div>
        ) : (
          tool?.controls.map((control) => {
            const small = SMALL.has(control.kind)
            return (
              <div
                key={control.id}
                data-control={control.id}
                className={cn("flex gap-4 border-b p-5 last:border-b-0", LINE)}
              >
                <div
                  className={cn(
                    "text-xs/4",
                    small ? "min-w-0 flex-1" : "w-32 shrink-0"
                  )}
                >
                  <div className="font-medium">{control.title}</div>
                  <div className="text-balance text-white/60">
                    {control.description}
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-center",
                    small
                      ? "max-w-[55%] shrink-0"
                      : "min-w-0 flex-1 justify-center"
                  )}
                >
                  <ControlOf
                    control={control}
                    onSet={(value) => setControl(tool.id, control.id, value)}
                    onPress={(option) =>
                      pressControl(tool.id, control.id, option)
                    }
                  />
                </div>
              </div>
            )
          })
        )}
        {/* room for it, while it has not yet said what it is */}
        {tool &&
          !tool.ready &&
          tool.error === null &&
          tool.controls.length === 0 && <div className="h-24" />}
      </div>
    </div>
  )
}
