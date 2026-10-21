import * as React from "react"
import { cn } from "cn"

import { withFigure, type ReferenceScene } from "@/lib/reference"
import { useStore } from "@/lib/store"
import { useScenePictures } from "./viewport/reference"

const FOCUS = "focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * The reference scenes there are to set the model in: a card for each, with a picture of
 * it, what it is called and, under that, the sizes that make it something to measure
 * by. The project's own comes first, if it has one, and then the app's.
 *
 * Picking one sets the model in it, and it is the one for that project from then on.
 * Picking the one the model is in takes the model out of it again. Esc or a press
 * anywhere else puts the list away, and leaves the model as it is.
 */
export function ReferencePanel({
  scenes,
  shown,
  className,
}: {
  scenes: ReferenceScene[]
  /** the scene the model is set in, by what it is known by; null if it is in none */
  shown: string | null
  className?: string
}) {
  const setView = useStore((state) => state.setView)
  const pickScene = useStore((state) => state.pickScene)
  const setReferenceOpen = useStore((state) => state.setReferenceOpen)
  // pictured as each is before a figure is asked for in it
  const plain = React.useMemo(
    () => scenes.map((scene) => withFigure(scene, false)),
    [scenes]
  )
  const pictures = useScenePictures(plain)
  const panel = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const away = (event: PointerEvent) => {
      const on = event.target as Element | null
      if (!on || panel.current?.contains(on)) return
      // the button that brought the list up also puts it away: that press is its own
      if (on.closest("[data-opens=reference]")) return
      setReferenceOpen(false)
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [setReferenceOpen])

  return (
    <div
      ref={panel}
      role="group"
      aria-label="Reference scene"
      // a press here picks, and takes the keys from nowhere: they go on being the view's
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        // rounded as a group's card in the list of parts is and lined as the list is,
        // and a shade lighter than the view it lies over, in the dark as in the light
        "pointer-events-auto flex w-72.5 flex-col overflow-hidden rounded-2xl bg-background shadow-lg ring-1 ring-foreground/10 select-none dark:bg-[color-mix(in_srgb,var(--sidebar),var(--foreground)_2.6%)]",
        className
      )}
    >
      <h2 className="px-5 pt-4.25 pb-3.75 text-[17px]/6 font-medium">
        Reference scene
      </h2>
      <div className="flex min-h-0 scroll-fade [scrollbar-width:none] flex-col gap-5 overflow-y-auto px-5 pb-5">
        {scenes.map((scene) => {
          const lit = scene.id === shown
          const url = pictures[scene.id]
          return (
            <button
              key={scene.id}
              type="button"
              aria-pressed={lit}
              data-scene={scene.id}
              onClick={() =>
                lit ? setView({ reference: null }) : pickScene(scene.id)
              }
              className={cn(
                // the square a part is pictured on in the list of parts, lines and all
                "relative aspect-square w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border bg-foreground/9 text-left",
                FOCUS,
                lit
                  ? // one line, two pixels wide, drawn inside the square
                    "border-transparent outline-2 -outline-offset-2 outline-foreground"
                  : "outline-none hover:border-foreground/40"
              )}
            >
              {url && (
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="absolute top-2 left-1/2 size-50 -translate-x-1/2"
                />
              )}
              <span className="absolute inset-x-3 bottom-2.25 flex flex-col text-[11px] leading-4">
                <span className="truncate font-medium">{scene.name}</span>
                <span className="truncate text-foreground/45">
                  {scene.detail || (scene.own ? "This project’s own" : " ")}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
