// What a right click on a picture of the board offers: to find its file in the folder
// it is kept in, and to read what the agent made of it when it was put there, which the
// board does not otherwise show. That is in a popover of its own, no taller than so
// much, at the place clicked, as the menu was.
import * as React from "react"
import { FolderOpenIcon, ScanEyeIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import type { InspirationImage } from "@shared/inspiration-format"

/** A picture clicked on, and where, px from the window's top left. */
export type ImageClicked = { image: string; x: number; y: number }

/** Something to be put at the place clicked, as a menu of the window's own is. */
const anchorAt = (clicked: ImageClicked | null) =>
  clicked
    ? { getBoundingClientRect: () => new DOMRect(clicked.x, clicked.y, 0, 0) }
    : null

export function ImageMenu({
  clicked,
  onReveal,
  onSeen,
  onClose,
}: {
  clicked: ImageClicked | null
  /** show the picture's file in its folder */
  onReveal: (clicked: ImageClicked) => void
  /** say what the agent made of it */
  onSeen: (clicked: ImageClicked) => void
  onClose: () => void
}) {
  const anchor = React.useMemo(() => anchorAt(clicked), [clicked])
  return (
    <DropdownMenu
      open={clicked !== null}
      onOpenChange={(now) => {
        if (!now) onClose()
      }}
    >
      {clicked && anchor && (
        <DropdownMenuContent anchor={anchor} align="start" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              onReveal(clicked)
              onClose()
            }}
          >
            <FolderOpenIcon />
            Open in folder
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onSeen(clicked)
              onClose()
            }}
          >
            <ScanEyeIcon />
            What the agent sees
          </DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  )
}

/**
 * What the agent made of a picture, line by line as it said it ("Form: …"), each by its
 * name: or that it is looking at it still, or has not yet.
 */
export function AgentSees({
  clicked,
  image,
  analysing,
  onClose,
}: {
  clicked: ImageClicked | null
  image: InspirationImage | null
  analysing: boolean
  onClose: () => void
}) {
  const anchor = React.useMemo(() => anchorAt(clicked), [clicked])
  const lines = (image?.overview ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const named = /^([A-Z][a-z]+):\s*(.*)$/.exec(line)
      const said = named ? named[2] : line
      // (as a sentence begins, which the agent's lines do not always)
      return {
        name: named ? named[1] : null,
        said: said.charAt(0).toUpperCase() + said.slice(1),
      }
    })
  return (
    <Popover
      open={clicked !== null && image !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {anchor && image && (
        <PopoverContent
          anchor={anchor}
          side="right"
          align="start"
          collisionPadding={12}
          className="max-h-[min(22rem,var(--available-height))] w-88 gap-0 overflow-y-auto p-0 selection:bg-black/10 dark:selection:bg-white/10"
        >
          <div className="px-5 pt-5 pb-3">
            <div className="font-medium">What the agent sees</div>
            <div className="truncate text-muted-foreground">{image.name}</div>
          </div>
          {lines.length > 0 ? (
            <dl className="px-5 pb-5">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="border-t border-foreground/10 py-3 leading-relaxed"
                >
                  {line.name && <dt className="font-medium">{line.name}</dt>}
                  <dd className="text-muted-foreground">{line.said}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mx-5 mb-5 flex items-center gap-2 border-t border-foreground/10 pt-3 text-muted-foreground">
              {analysing && <Spinner />}
              {analysing
                ? "The agent is looking at it now…"
                : "The agent hasn't looked at this image yet."}
            </div>
          )}
        </PopoverContent>
      )}
    </Popover>
  )
}
