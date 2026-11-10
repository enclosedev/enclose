import * as React from "react"
import { cn } from "cn"

/** A run of settings that belong together, under a heading if they have one. */
export function Group({
  title,
  children,
}: {
  title?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      {title && (
        <h2 className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
          {title}
        </h2>
      )}
      <div className="divide-y divide-border/60 rounded-2xl bg-card ring-1 ring-foreground/10">
        {children}
      </div>
    </section>
  )
}

/**
 * One setting: what it is and what it does on the left, the control on the right. One
 * that may `wrap` puts its control underneath where there is no room beside. One in
 * `halves` gives each side half of the row, whatever is on it, for the control to fill:
 * a run of them lines up down the middle. One that is `flush` leaves the room at its
 * sides to what holds it.
 */
export function Row({
  title,
  detail,
  wrap,
  halves,
  flush,
  children,
}: {
  title: React.ReactNode
  detail?: React.ReactNode
  wrap?: boolean
  halves?: boolean
  flush?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-x-6 gap-y-2.5 py-4",
        !flush && "px-4",
        wrap && "flex-wrap",
        halves && "grid grid-cols-2"
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col gap-0.5",
          wrap && "min-w-44 flex-1"
        )}
      >
        <span className="text-sm font-medium">{title}</span>
        {detail && (
          <span className="text-sm text-muted-foreground">{detail}</span>
        )}
      </div>
      {children && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            halves && "min-w-0 shrink"
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
