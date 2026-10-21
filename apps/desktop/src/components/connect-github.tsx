import { Dialog } from "@base-ui/react/dialog"

import type { GitHubConnection } from "@shared/api"
import { GitHubIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Connecting GitHub, over everything while it is under way: the code to enter on
 * GitHub's site, and then Enclose to be installed on the account. Put away (Esc, Cancel,
 * or a click past it), it stops.
 */
export function ConnectGitHub({
  connection,
}: {
  connection: GitHubConnection
}) {
  const { github } = window.cad
  const open = connection.state === "code" || connection.state === "install"
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(opened) => {
        if (!opened) void github.cancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-150 dark:bg-black/60 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          data-slot="connect-github"
          aria-label={
            connection.state === "install"
              ? "Install Enclose on GitHub"
              : "Connect GitHub"
          }
          className="no-drag fixed top-1/2 left-1/2 z-50 flex w-80 -translate-1/2 flex-col items-center gap-5 rounded-3xl bg-card px-8 pt-8 pb-6 text-center shadow-2xl ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
        >
          <GitHubIcon className="size-6" />
          {/* what to do, and the code to do it with, read as one paragraph */}
          <Dialog.Description className="text-sm text-balance text-muted-foreground">
            {connection.state === "install" ? (
              <>
                Signed in as @{connection.login}. Install Enclose on your
                account so it can keep your projects there.
                <br />
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Spinner className="size-3.5" />
                  Waiting for GitHub
                </span>
              </>
            ) : (
              <>
                Enter this code on GitHub to back up your projects:
                <br />
                <span className="font-mono text-foreground select-all">
                  {connection.state === "code" ? connection.code : ""}
                </span>
              </>
            )}
          </Dialog.Description>
          <div className="flex flex-col items-center gap-1">
            <Button
              onClick={() =>
                void (connection.state === "code"
                  ? github.openCode()
                  : github.openInstall())
              }
            >
              {connection.state === "code"
                ? "Copy code and open GitHub"
                : "Open GitHub"}
            </Button>
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
