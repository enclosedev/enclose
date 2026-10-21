import * as React from "react"
import { cn } from "cn"

import type { PaletteName } from "@shared/palette"
import { partsPicture } from "@/components/theme-creator/parts"

/** A theme the window can be drawn in. */
type Drawn = "light" | "dark"

/** A button floating over the view, and one that is on. */
const ROUND = "fill-background/60 stroke-foreground/15"
const LIT = "fill-primary"
/** A line of writing, too small to be read: what is said, and what is said of it. */
const SAID = "fill-foreground/60"
const QUIET = "fill-muted-foreground/60"

/** How the model is looked at: the buttons half way down the view's right-hand edge. */
const LOOKS = [81.5, 90.5, 99.5, 108.5, 117.5, 126.5]
/** Where the picture is split, when it is of two themes: half way across. */
const SPLIT = 160
/** Where the parts are drawn in the view: clear of its buttons, and as big as that leaves. */
const PARTS = { x: 24, y: 22, width: 190, height: 167 }

/**
 * The window in small, as a theme draws it: the view with a part in each of the palette's
 * colours in it (as the theme creator has them), the projects' cards and the buttons over
 * it, and the conversation beside it. Each half of it stands inside the class that sets a
 * theme's colours and is drawn in nothing but those, so it shows a theme whether or not
 * the app is in it. `system` is light on the left and dark on the right, the parts whole
 * across the two. `colours` are a theme's own, for each look, in place of those the app
 * is drawn in (see src/lib/themes.ts): with them, it is that theme that is shown, and not
 * the one the app is in. `palettes` are what the parts are drawn in, in each look.
 */
export function Miniature({
  theme,
  colours,
  palettes,
  className,
}: {
  theme: Drawn | "system"
  colours?: Record<Drawn, React.CSSProperties>
  palettes: Record<Drawn, Record<PaletteName, string>>
  className?: string
}) {
  const left: Drawn = theme === "dark" ? "dark" : "light"
  const right: Drawn = theme === "light" ? "light" : "dark"
  const leftPalette = palettes[left]
  const rightPalette = palettes[right]
  const pictures = React.useMemo(
    () => ({
      left: partsPicture(leftPalette),
      right: partsPicture(rightPalette),
    }),
    [leftPalette, rightPalette]
  )
  return (
    <svg
      viewBox="0 0 320 208"
      aria-hidden
      data-theme-preview={colours ? "" : undefined}
      strokeWidth={1}
      className={cn(
        "block w-full **:[vector-effect:non-scaling-stroke]",
        className
      )}
    >
      <g className={left} style={colours?.[left]}>
        {/* the view: all of it, so that the other half is drawn over this one and no
            gap shows between two halves that are the same */}
        <rect width="236" height="208" className="fill-sidebar" />

        {/* the projects' cards, the open one lit, and under them the button for a new
            one */}
        <rect
          x="4.5"
          y="10"
          width="42"
          height="12.5"
          rx="2.4"
          className="fill-sidebar-accent/90 stroke-card-outline"
        />
        <rect x="7.5" y="13.2" width="12" height="2" rx="1" className={SAID} />
        <rect x="7.5" y="17.3" width="22" height="2" rx="1" className={QUIET} />
        <rect
          x="4.5"
          y="24.5"
          width="42"
          height="12.5"
          rx="2.4"
          className="fill-sidebar-accent/45 stroke-card-outline/35"
        />
        <rect x="7.5" y="27.7" width="16" height="2" rx="1" className={SAID} />
        <rect x="7.5" y="31.8" width="18" height="2" rx="1" className={QUIET} />
        <circle cx="8.2" cy="43.4" r="3.6" className={ROUND} />
        {/* the settings, in the corner */}
        <circle cx="10" cy="197.6" r="3.6" className={ROUND} />
      </g>

      <g className={right} style={colours?.[right]}>
        {/* the rest of the view, and the conversation beside it */}
        <rect
          x={SPLIT}
          width={236 - SPLIT}
          height="208"
          className="fill-sidebar"
        />
        <rect x="236" width="84" height="208" className="fill-chat" />
        <line x1="236" x2="236" y2="208" className="stroke-border" />

        {/* down the view's right-hand edge: the conversation, which is open, and the
            model as a file; then how the model is looked at */}
        <circle cx="228.4" cy="7" r="3.6" className={LIT} />
        <circle cx="228.4" cy="16" r="3.6" className={ROUND} />
        {LOOKS.map((cy) => (
          <circle key={cy} cx="228.4" cy={cy} r="3.6" className={ROUND} />
        ))}

        {/* the model's three axes, in the corner */}
        <g strokeLinecap="round">
          <line
            x1="221"
            y1="197.5"
            x2="221"
            y2="191.4"
            stroke="var(--axis-z)"
          />
          <line
            x1="221"
            y1="197.5"
            x2="225.2"
            y2="194"
            stroke="var(--axis-y)"
          />
          <line
            x1="221"
            y1="197.5"
            x2="226.6"
            y2="199.6"
            stroke="var(--axis-x)"
          />
          <circle cx="221" cy="191.4" r="1.9" fill="var(--axis-z)" />
          <circle cx="225.2" cy="194" r="1.9" fill="var(--axis-y)" />
          <circle cx="226.6" cy="199.6" r="1.9" fill="var(--axis-x)" />
        </g>

        {/* the conversation: what it is called, what was asked, and what Claude said */}
        <rect
          x="243"
          y="5.4"
          width="28"
          height="2.2"
          rx="1.1"
          className={SAID}
        />
        <rect
          x="268"
          y="20"
          width="45"
          height="13.5"
          rx="4"
          className="fill-user-message"
        />
        <rect x="272" y="24" width="37" height="2" rx="1" className={SAID} />
        <rect x="272" y="28.2" width="22" height="2" rx="1" className={SAID} />
        <rect x="243" y="43" width="60" height="2" rx="1" className={SAID} />
        <rect x="243" y="47.6" width="66" height="2" rx="1" className={SAID} />
        <rect x="243" y="52.2" width="44" height="2" rx="1" className={SAID} />
        <rect x="243" y="60.4" width="30" height="2" rx="1" className={QUIET} />
        <rect x="243" y="68.6" width="56" height="2" rx="1" className={SAID} />
        <rect x="243" y="73.2" width="38" height="2" rx="1" className={SAID} />

        {/* the message box: what it asks for, how it will be answered, and the button
            that sends it */}
        <rect
          x="241"
          y="177.5"
          width="73.5"
          height="25"
          rx="4.5"
          className="fill-input/30 stroke-input"
        />
        <rect x="245" y="182" width="42" height="2" rx="1" className={QUIET} />
        <circle cx="246.2" cy="196.4" r="1.4" fill="#d97757" />
        <rect
          x="249.5"
          y="195.4"
          width="32"
          height="2"
          rx="1"
          className={QUIET}
        />
        <circle cx="308.4" cy="196.3" r="3.2" className={LIT} />
      </g>

      {/* the parts, over both halves, each half of them in its own look's colours */}
      {pictures.left === pictures.right ? (
        pictures.left && <image href={pictures.left} {...PARTS} />
      ) : (
        <>
          {pictures.left && (
            <svg width={SPLIT} height="208">
              <image href={pictures.left} {...PARTS} />
            </svg>
          )}
          {pictures.right && (
            <svg x={SPLIT} width={236 - SPLIT} height="208">
              <image href={pictures.right} {...PARTS} x={PARTS.x - SPLIT} />
            </svg>
          )}
        </>
      )}
    </svg>
  )
}
