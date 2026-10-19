// What a group on the inspiration board stands for: see inspiration-mode.tsx.
import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"

import { TITLE_LONGEST } from "@shared/inspiration-format"
import { Button } from "@/components/ui/button"

const counted = (many: number, what: string) =>
  `${many} ${what}${many === 1 ? "" : "s"}`

/** A group being named, as it is made or again later. */
export type Naming =
  | { kind: "new"; images: string[]; title: string }
  | { kind: "rename"; group: string; title: string }

/**
 * What a group of pictures is called: asked as it is made, in a few words, which the
 * agent goes by as what the pictures stand for together; and asked again from its title.
 */
export function NameGroup({
  naming,
  onNamed,
  onCancel,
}: {
  naming: Naming
  onNamed: (title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(naming.title)
  const said = title.replace(/\s+/g, " ").trim()
  const make = () => {
    if (said) onNamed(said.slice(0, TITLE_LONGEST))
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-150 dark:bg-black/60 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          aria-label={
            naming.kind === "new" ? "Name the group" : "Rename the group"
          }
          className="no-drag fixed top-1/2 left-1/2 z-50 flex w-96 -translate-1/2 flex-col gap-4 rounded-3xl bg-card px-6 pt-6 pb-5 shadow-2xl ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="text-base font-semibold">
              {naming.kind === "new"
                ? `Group ${counted(naming.images.length, "image")}`
                : "Rename the group"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-balance text-muted-foreground">
              Say what these images stand for together. The agent takes them as
              one thing.
            </Dialog.Description>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              make()
            }}
          >
            <div className="relative">
              <input
                autoFocus
                type="text"
                aria-label="Group title"
                placeholder="Material inspirations"
                maxLength={TITLE_LONGEST}
                spellCheck={false}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-10 w-full rounded-4xl border border-input bg-input/30 pr-14 pl-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                {TITLE_LONGEST - title.length}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button type="submit" disabled={!said}>
                {naming.kind === "new" ? "Group" : "Rename"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
