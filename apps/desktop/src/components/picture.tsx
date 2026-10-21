import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "cn"
import { ImageOffIcon } from "lucide-react"

import type { Attached } from "@shared/api"
import { pictureName, pictureUrl } from "@shared/pictures"
import { sizeOf } from "@/lib/pictures"

/**
 * A picture put with a message, small. Pressed, it is shown as big as the window has
 * room for, over everything; pressed again, or with Esc, it is put away.
 */
export function Thumb({
  projectId,
  picture,
  className,
}: {
  projectId: string
  picture: Attached
  className?: string
}) {
  const src = pictureUrl(projectId, picture.id)
  const [gone, setGone] = React.useState(false)
  const said = `${pictureName(picture.number)} · ${picture.name} · ${sizeOf(picture.bytes)}`
  if (gone)
    return (
      <div
        title={said}
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className
        )}
      >
        <ImageOffIcon size={16} absoluteStrokeWidth strokeWidth={1} />
      </div>
    )
  return (
    <Dialog.Root>
      <Dialog.Trigger
        title={said}
        className={cn(
          "cursor-zoom-in overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <img
          src={src}
          alt={picture.name}
          draggable={false}
          onError={() => setGone(true)}
          className="size-full object-cover"
        />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          aria-label={said}
          className="no-drag fixed inset-0 z-50 flex items-center justify-center p-10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <Dialog.Close
            aria-label="Close"
            className="absolute inset-0 cursor-zoom-out outline-none"
          />
          <img
            src={src}
            alt={picture.name}
            draggable={false}
            className="pointer-events-none relative max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
