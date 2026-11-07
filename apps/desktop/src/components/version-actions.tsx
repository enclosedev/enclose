// What can be done with a version of a project, as a whole: made the main one, or
// discarded. Each conversation is a version of the project (electron/versions.ts), and
// where a project has more than one, one of them is its main version.
import { cn } from "cn"
import { AsteriskIcon, EllipsisIcon } from "lucide-react"

import type { ConversationSummary } from "@shared/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"

export const MAKE_MAIN = "Make main version"
export const DISCARD = "Discard version"

/**
 * What can be done with a version: null where nothing can, it being the main one, or
 * there being no main one (one version only, or versions switched off). `shown` is
 * whether the panel shows it: discarded, the main version is shown in its place.
 */
export function useVersionActions(
  projectId: string,
  conversation: ConversationSummary | null,
  conversations: ConversationSummary[],
  shown: boolean
) {
  const openConversation = useStore((state) => state.openConversation)
  if (
    !conversation ||
    conversation.main ||
    !conversations.some((one) => one.main)
  )
    return null
  const { id } = conversation
  return {
    makeMain: () =>
      void window.cad.thread.makeMain(projectId, id).then((made) => {
        if (made) openConversation(projectId, id)
      }),
    /** (one at work, or making a board, waits for that to be over) */
    discardable: conversation.status === "idle" && !conversation.job,
    discard: () =>
      void window.cad.thread.discard(projectId, id).then((next) => {
        if (next && shown) openConversation(projectId, next)
      }),
  }
}

/** Beside the name of a project's main version: an asterisk. */
export function MainMark({ className }: { className?: string }) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <span
            data-main-mark
            className={cn("inline-flex shrink-0 text-main-version", className)}
          />
        }
      >
        <AsteriskIcon aria-hidden className="size-3.5" />
        <span className="sr-only">Main version</span>
      </TooltipTrigger>
      <TooltipContent>Main version</TooltipContent>
    </Tooltip>
  )
}

/** At the top of a conversation that is a version other than the main one: its menu. */
export function VersionMenu({
  projectId,
  conversation,
  conversations,
}: {
  projectId: string
  conversation: ConversationSummary | null
  conversations: ConversationSummary[]
}) {
  const actions = useVersionActions(
    projectId,
    conversation,
    conversations,
    true
  )
  if (!actions) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:text-foreground"
          />
        }
      >
        <EllipsisIcon />
        <span className="sr-only">Version</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={actions.makeMain}>
            {MAKE_MAIN}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={!actions.discardable}
            onClick={actions.discard}
          >
            {DISCARD}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
