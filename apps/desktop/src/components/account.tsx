import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Lock } from "lucide-react"

import type {
  AccountState,
  CloudProject,
  CloudState,
  TooBig,
} from "@shared/api"
import { Logo } from "@/components/mark"
import { Group, Row } from "@/components/setting"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"

/** The dialogs over the settings: Esc puts them away, and not the settings under them. */
export const ACCOUNT_DIALOGS =
  '[data-slot="sign-in"], [data-slot="delete-account"]'

/** So many bytes, as a person reads them: "0 B", "340 MB", "1.2 GB". */
export function sizeOf(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const shown =
    unit === 0 || value >= 10 || Number.isInteger(value)
      ? Math.round(value).toString()
      : value.toFixed(1)
  return `${shown} ${units[unit]}`
}

/**
 * Settings, Account: the Enclose account, signed in to with a code sent by email on a
 * page the browser opens. Signed in, it says who, how much the account keeps of the most
 * it may, and has signing out and deleting the account.
 */
export function AccountPage() {
  const account = useStore((state) => state.account)
  // what there is of the account, asked again each time the page is turned to
  React.useEffect(() => {
    void window.cad.account.refresh()
  }, [])
  return (
    <>
      {account.state === "in" ? (
        <SignedIn account={account} />
      ) : (
        <SignedOut account={account} />
      )}
      {account.server && (
        <p className="-mt-4 px-1 text-sm text-muted-foreground">
          On the server at {account.server}
        </p>
      )}
      <SignIn account={account} />
    </>
  )
}

function SignedOut({ account }: { account: AccountState }) {
  const trouble = account.state === "out" ? account.trouble : null
  return (
    <div className="flex min-h-24.5 items-center gap-5 rounded-2xl bg-card pr-7 pl-8 ring-1 ring-foreground/10">
      <span className="flex min-w-0 flex-1 items-center gap-6">
        <Logo size={26} className="shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">Enclose account</span>
          <span
            className={
              trouble
                ? "text-sm text-balance text-destructive"
                : "text-sm text-balance text-muted-foreground"
            }
          >
            {trouble ??
              "Create an account and back up your projects on Enclose Cloud. You get 5 GB free."}
          </span>
        </span>
      </span>
      <Button
        size="sm"
        disabled={account.state === "signing-in"}
        onClick={() => void window.cad.account.signIn()}
      >
        {account.state === "signing-in" ? "Signing in…" : "Sign in"}
      </Button>
    </div>
  )
}

function SignedIn({
  account,
}: {
  account: Extract<AccountState, { state: "in" }>
}) {
  const [deleting, setDeleting] = React.useState(false)
  return (
    <>
      <div className="flex min-h-24.5 items-center gap-5 rounded-2xl bg-card pr-7 pl-8 ring-1 ring-foreground/10">
        <span className="flex min-w-0 flex-1 items-center gap-6">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground uppercase"
          >
            {(account.name || account.email).slice(0, 1)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {account.name || account.email}
            </span>
            <span
              className={
                account.trouble
                  ? "truncate text-sm text-destructive"
                  : "truncate text-sm text-muted-foreground"
              }
            >
              {account.trouble ?? (account.name ? account.email : "Signed in")}
            </span>
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void window.cad.account.signOut()}
        >
          Sign out
        </Button>
      </div>
      <YourFiles account={account} />
      <Group>
        <Row
          title="Delete account"
          detail="Your files are safe on this computer."
          balance
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleting(true)}
          >
            Delete account
          </Button>
        </Row>
      </Group>
      <DeleteAccount open={deleting} onClose={() => setDeleting(false)} />
    </>
  )
}

/** So many, as a person reads them: "1,204". */
const many = (count: number) => count.toLocaleString("en-US")

/** A bar, so far along of the whole. */
function Bar({
  done,
  total,
  label,
}: {
  done: number
  total: number
  label: string
}) {
  const share = total > 0 ? Math.min(1, done / total) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${share * 100}%` }}
      />
    </div>
  )
}

/**
 * The account's room, with what there is to upload over it: what is backed up (white),
 * what is to upload that fits (yellow), and what goes past the most it may keep (red),
 * each saying what it is when pointed at.
 */
function RoomBar({
  used,
  needed,
  limit,
}: {
  used: number
  needed: number
  limit: number
}) {
  const whole = Math.max(limit, used + needed)
  const fits = Math.max(0, Math.min(needed, limit - used))
  const over = Math.max(0, used + needed - limit)
  const parts = [
    { size: used, color: "bg-primary", said: `Backed up · ${sizeOf(used)}` },
    { size: fits, color: "bg-amber-400", said: `Fits · ${sizeOf(fits)}` },
    {
      size: over,
      color: "bg-destructive",
      said: `Over your ${sizeOf(limit)} · ${sizeOf(over)}`,
    },
  ].filter((part) => part.size > 0)
  return (
    <div
      role="meter"
      aria-label="Room on Enclose Cloud"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={used + needed}
      className="flex h-1.5 w-32 shrink-0 gap-0.5 overflow-hidden rounded-full bg-muted"
    >
      {parts.map((part) => (
        <Tooltip key={part.color} disableHoverablePopup>
          <TooltipTrigger
            render={
              <div
                className={`h-full min-w-1 ${part.color}`}
                style={{ flexGrow: part.size / whole, flexBasis: 0 }}
              />
            }
          />
          <TooltipContent>{part.said}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/**
 * The projects on Enclose Cloud: before the first backup, an offer to back them up;
 * after, how much of the account's room they take, and the files left out for being too
 * big. Meanwhile, how far a backup has got, or what stopped it (cloud.ts).
 */
function YourFiles({
  account,
}: {
  account: Extract<AccountState, { state: "in" }>
}) {
  const cloud = useStore((state) => state.cloud)
  const { storage, backup } = account
  const backedUp = Boolean(backup?.at)
  const title = backedUp ? (
    <>
      <Lock aria-hidden className="size-3.5" />
      Your files
    </>
  ) : (
    "Enclose Cloud"
  )
  return (
    <>
      <Group title={title}>
        <FilesRow
          cloud={cloud}
          storage={storage}
          backedUp={backedUp}
          known={backup !== null}
        />
        {backedUp && cloud.state === "idle" && (
          <NotHere at={backup?.at ?? null} />
        )}
        {cloud.state === "full" ? (
          <Projects
            title="Free up room"
            detail="Remove projects you don't need from Enclose Cloud."
          />
        ) : (
          backedUp &&
          cloud.state === "idle" && (
            <Projects
              title="Projects"
              detail="Choose which projects are backed up."
            />
          )
        )}
        {cloud.state === "idle" && cloud.tooBig.length > 0 && (
          <TooBigFiles files={cloud.tooBig} />
        )}
      </Group>
    </>
  )
}

const backUp = () => void window.cad.cloud.backUp()

function Stop() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void window.cad.cloud.stop()}
    >
      Stop
    </Button>
  )
}

function FilesRow({
  cloud,
  storage,
  backedUp,
  known,
}: {
  cloud: CloudState
  storage: { used: number; limit: number } | null
  backedUp: boolean
  /** whether the server has said yet what the account has backed up */
  known: boolean
}) {
  switch (cloud.state) {
    case "downloading":
      return (
        <Row
          title={`Downloading ${cloud.project}`}
          detail={`${many(cloud.files.done)} of ${many(cloud.files.total)} files · ${sizeOf(cloud.bytes.done)} of ${sizeOf(cloud.bytes.total)}`}
          balance
        >
          <div className="flex items-center gap-4">
            <Bar
              done={cloud.bytes.done}
              total={cloud.bytes.total}
              label="Downloaded"
            />
            <Stop />
          </div>
        </Row>
      )
    case "uploading":
      return (
        <Row
          title={`Uploading ${many(cloud.files.done)} of ${many(cloud.files.total)} files`}
          detail={`${sizeOf(cloud.bytes.done)} of ${sizeOf(cloud.bytes.total)}`}
          balance
        >
          <div className="flex items-center gap-4">
            <Bar
              done={cloud.bytes.done}
              total={cloud.bytes.total}
              label="Uploaded"
            />
            <Stop />
          </div>
        </Row>
      )
    case "waiting":
      return (
        <Row
          title={cloud.offline ? "You're offline" : "Can't reach Enclose Cloud"}
          detail={`${many(cloud.files.done)} of ${many(cloud.files.total)} files uploaded. It goes on by itself once ${cloud.offline ? "you're back online" : "it answers"}.`}
          balance
        >
          <Stop />
        </Row>
      )
    case "failed":
      return (
        <Row title="Backing up didn't finish" detail={cloud.trouble} balance>
          <Button size="sm" onClick={backUp}>
            Try again
          </Button>
        </Row>
      )
    case "full":
      return (
        <Row
          title="Not enough room"
          detail={`${sizeOf(Math.max(0, cloud.used + cloud.needed - cloud.limit))} over your ${sizeOf(cloud.limit)}.`}
          balance
        >
          <div className="flex items-center gap-4">
            <RoomBar
              used={cloud.used}
              needed={cloud.needed}
              limit={cloud.limit}
            />
            <Button variant="outline" size="sm" onClick={backUp}>
              Try again
            </Button>
          </div>
        </Row>
      )
    case "preparing":
      // (backed up before: looking for what changed, quietly, in its usual place)
      if (!backedUp)
        return (
          <Row
            title="Getting your files ready"
            detail={`Found ${many(cloud.files)} files`}
            balance
          >
            <div className="flex items-center gap-4">
              <Spinner className="size-4 text-muted-foreground" />
              <Stop />
            </div>
          </Row>
        )
  }
  if (!known || !storage)
    return (
      <Row title="Your files" detail="Asking Enclose Cloud…">
        <Spinner className="size-4 text-muted-foreground" />
      </Row>
    )
  if (!backedUp)
    return (
      <Row
        title="Keep a copy of your projects"
        detail={`Back them up on Enclose Cloud, free up to ${sizeOf(storage.limit)}.`}
        balance
      >
        <Button size="sm" onClick={backUp}>
          Back up
        </Button>
      </Row>
    )
  return (
    <Row
      title={`${sizeOf(storage.used)} of ${sizeOf(storage.limit)} used`}
      detail="Your projects are backed up on Enclose Cloud for free."
      balance
    >
      {cloud.state === "preparing" ? (
        <Spinner className="size-4 text-muted-foreground" />
      ) : (
        <Bar done={storage.used} total={storage.limit} label="Storage used" />
      )}
    </Row>
  )
}

/**
 * The projects on Enclose Cloud that are not on this computer (as on a new one, signed in
 * to the account): each brought back here at a click, into a folder of its own where new
 * projects go. Asked of Enclose Cloud again each time it has been backed up to.
 */
function NotHere({ at }: { at: number | null }) {
  const [projects, setProjects] = React.useState<CloudProject[] | null>(null)
  React.useEffect(() => {
    let live = true
    void window.cad.cloud.projects().then((listed) => {
      if (live) setProjects(listed?.filter((one) => !one.here) ?? null)
    })
    return () => {
      live = false
    }
  }, [at])
  if (!projects?.length) return null
  const restore = (ids: string[]) => void window.cad.cloud.restore(ids)
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">Not on this computer</span>
          <span className="text-sm text-balance text-muted-foreground">
            Download your projects from Enclose Cloud to work on them here.
          </span>
        </div>
        {projects.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => restore(projects.map((one) => one.id))}
          >
            Download all
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 py-2 pr-2 pl-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{project.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {project.bytes !== null ? sizeOf(project.bytes) : ""}
              </span>
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => restore([project.id])}
            >
              Download
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** How many files too big are listed before "Show all". */
const FIRST = 5

/** The files left out for being too big: each shown in its folder at a click. */
function TooBigFiles({ files }: { files: TooBig[] }) {
  const [all, setAll] = React.useState(false)
  const shown = all ? files : files.slice(0, FIRST)
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Too big to back up</span>
        <span className="text-sm text-balance text-muted-foreground">
          Files over 95 MB stay on this computer only.
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((file) => (
          <li
            key={file.path}
            className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 py-2 pr-2 pl-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">
                {file.path.split(/[\\/]/).at(-1)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {file.project} · {sizeOf(file.size)}
              </span>
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void window.cad.cloud.reveal(file.path)}
            >
              View file
            </Button>
          </li>
        ))}
      </ul>
      {files.length > FIRST && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setAll(!all)}
        >
          {all ? "Show fewer" : `Show all ${many(files.length)}`}
        </Button>
      )}
    </div>
  )
}

/**
 * Which projects are backed up: listed in place, at "Choose projects", each with a switch.
 * Turned off, one is removed from Enclose Cloud and not backed up again, once that is
 * saved; turned on, it is backed up again (as far as the account has room for it).
 */
function Projects({ title, detail }: { title: string; detail: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-sm text-balance text-muted-foreground">
            {open
              ? "Turned off, a project is removed from Enclose Cloud and not backed up again. It stays on this computer."
              : detail}
          </span>
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Choose projects
          </Button>
        )}
      </div>
      {open && <ProjectChoices onDone={() => setOpen(false)} />}
    </div>
  )
}

function ProjectChoices({ onDone }: { onDone: () => void }) {
  const [projects, setProjects] = React.useState<CloudProject[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [off, setOff] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [trouble, setTrouble] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    void window.cad.cloud.projects().then((listed) => {
      if (!live) return
      if (!listed) return setFailed(true)
      setProjects(listed)
      setOff(new Set(listed.filter((one) => !one.on).map((one) => one.id)))
    })
    return () => {
      live = false
    }
  }, [])

  const save = async () => {
    setBusy(true)
    const why = await window.cad.cloud.choose([...off])
    setBusy(false)
    if (why) setTrouble(why)
    else onDone()
  }

  if (failed)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't reach Enclose Cloud. Try again in a moment.
      </p>
    )
  if (!projects) return <Spinner className="size-4 text-muted-foreground" />
  const changed = projects.some((one) => off.has(one.id) === one.on)
  const freed = projects
    .filter((one) => off.has(one.id) && one.on && one.bytes !== null)
    .reduce((sum, one) => sum + (one.bytes ?? 0), 0)
  return (
    <>
      <ul className="flex flex-col gap-1">
        {projects.map((project) => {
          const on = !off.has(project.id)
          return (
            <li key={project.id}>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-muted/40 py-2.5 pr-4 pl-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {project.bytes !== null
                      ? sizeOf(project.bytes)
                      : "Not backed up"}
                    {!project.here && " · Not on this computer"}
                  </span>
                </span>
                <Switch
                  checked={on}
                  // (one on Enclose Cloud alone can be taken off it, but not put back)
                  disabled={busy || (!project.here && !on)}
                  onCheckedChange={(checked) => {
                    const next = new Set(off)
                    if (checked) next.delete(project.id)
                    else next.add(project.id)
                    setOff(next)
                  }}
                />
              </label>
            </li>
          )
        })}
      </ul>
      {trouble && (
        <p role="alert" className="text-sm text-destructive">
          {trouble}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        {/* (nothing is taken off Enclose Cloud before this) */}
        <Button
          size="sm"
          disabled={busy || !changed}
          onClick={() => void save()}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {freed > 0 ? `Save and free ${sizeOf(freed)}` : "Save"}
        </Button>
      </div>
    </>
  )
}

const POPUP =
  "no-drag fixed top-1/2 left-1/2 z-50 flex w-80 -translate-1/2 flex-col items-center gap-5 rounded-3xl bg-card px-8 pt-8 pb-6 text-center shadow-2xl ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
const BACKDROP =
  "fixed inset-0 z-50 bg-black/40 duration-150 dark:bg-black/60 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"

/**
 * Signing in, over everything while it is under way: the page is open in the browser,
 * and the app waits for it. Where its link does not reach the app, the code the page
 * shows is pasted here instead. Put away (Esc, Cancel, or a click past it), it stops.
 */
function SignIn({ account }: { account: AccountState }) {
  return (
    <Dialog.Root
      open={account.state === "signing-in"}
      onOpenChange={(opened) => {
        if (!opened) void window.cad.account.cancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP} />
        <Dialog.Popup
          data-slot="sign-in"
          aria-label="Sign in to Enclose"
          className={POPUP}
        >
          <Logo size={28} />
          <Dialog.Description className="text-sm text-balance text-muted-foreground">
            Finish signing in in your browser.
            <br />
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Spinner className="size-3.5" />
              Waiting for the browser
            </span>
          </Dialog.Description>
          <Button
            variant="outline"
            onClick={() => void window.cad.account.openPage()}
          >
            Open the page again
          </Button>
          <PasteCode />
          <Dialog.Close render={<Button variant="ghost" />}>
            Cancel
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * The code the sign-in page shows, pasted. (Inside the dialog, it starts empty each time
 * the dialog opens.)
 */
function PasteCode() {
  const [code, setCode] = React.useState("")
  const [trouble, setTrouble] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const paste = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setTrouble(await window.cad.account.paste(code))
    setBusy(false)
  }

  return (
    <form
      onSubmit={(event) => void paste(event)}
      className="flex w-full flex-col gap-2"
    >
      <label htmlFor="sign-in-code" className="text-sm text-muted-foreground">
        Or paste the code the page shows
      </label>
      <div className="flex gap-2">
        <Input
          id="sign-in-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
        />
        <Button type="submit" disabled={!code.trim() || busy}>
          {busy ? <Spinner /> : "Sign in"}
        </Button>
      </div>
      {trouble && (
        <p role="alert" className="text-sm text-destructive">
          {trouble}
        </p>
      )}
    </form>
  )
}

/** Asked before the account is deleted: it cannot be had back. */
function DeleteAccount({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(opened) => {
        if (!opened) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP} />
        <Dialog.Popup
          data-slot="delete-account"
          aria-label="Delete your Enclose account"
          className={POPUP}
        >
          <Dialog.Title className="text-base font-medium">
            Delete your account?
          </Dialog.Title>
          <Dialog.Description className="text-sm text-balance text-muted-foreground">
            Your account and your backups on Enclose Cloud are deleted for good.
            Your files are safe on this computer.
          </Dialog.Description>
          <ConfirmDelete onDone={onClose} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The button that deletes the account, and what went wrong, where something did. */
function ConfirmDelete({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [trouble, setTrouble] = React.useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    const why = await window.cad.account.remove()
    setBusy(false)
    if (why) setTrouble(why)
    else onDone()
  }

  return (
    <>
      {trouble && (
        <p role="alert" className="text-sm text-balance text-destructive">
          {trouble}
        </p>
      )}
      <div className="flex flex-col items-center gap-1">
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy && <Spinner data-icon="inline-start" />}
          Delete account
        </Button>
        <Dialog.Close render={<Button variant="ghost" disabled={busy} />}>
          Cancel
        </Dialog.Close>
      </div>
    </>
  )
}
