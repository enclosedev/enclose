// What a group of projects goes by, written over: see sidebar.tsx.
import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"

import { Button } from "@/components/ui/button"

/** The most letters a group's name can have: as many as a project's. */
const LONGEST = 80

/**
 * A group of projects called something else, asked from its heading in the list: what
 * is written is its name, however the user likes, whatever its projects are called.
 */
export function RenameGroup({
  name,
  onNamed,
  onCancel,
}: {
  /** what it goes by now */
  name: string
  onNamed: (name: string) => void
  onCancel: () => void
}) {
  const [written, setWritten] = React.useState(name)
  const said = written.replace(/\s+/g, " ").trim()
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-150 dark:bg-black/60 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          aria-label="Rename the group"
          className="no-drag fixed top-1/2 left-1/2 z-50 flex w-96 -translate-1/2 flex-col gap-4 rounded-3xl bg-card px-6 pt-6 pb-5 shadow-2xl ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="text-base font-semibold">
              Rename the group
            </Dialog.Title>
            <Dialog.Description className="text-sm text-balance text-muted-foreground">
              Agents working on projects in this group can see each other's
              files.
            </Dialog.Description>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (said) onNamed(said.slice(0, LONGEST))
            }}
          >
            <input
              autoFocus
              type="text"
              aria-label="Group name"
              maxLength={LONGEST}
              spellCheck={false}
              value={written}
              onChange={(event) => setWritten(event.target.value)}
              onFocus={(event) => event.target.select()}
              className="h-10 w-full rounded-4xl border border-input bg-input/30 px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button type="submit" disabled={!said}>
                Rename
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
