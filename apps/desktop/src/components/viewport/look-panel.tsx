// What a part looks like, chosen by hand: its colour, and what it is made of. Opened from
// the ball beside a part that is picked out (see part-marks.tsx).
import * as React from "react"
import { cn } from "cn"
import { ArrowLeftIcon, SearchIcon } from "lucide-react"

import type { PartColour } from "@shared/colours-format"
import {
  hasGrain,
  MATERIAL_KINDS,
  MATERIAL_SETTINGS,
  MATERIALS,
  materialOf,
  type Material,
  type PartMaterial,
} from "@shared/materials"
import { PALETTE_NAMES, type PaletteName } from "@shared/palette"
import { PillSlider } from "@/components/pill-slider"
import { ColourPicker } from "@/components/theme-creator/picker"
import { currentPalette } from "@/lib/palette"
import { useStore } from "@/lib/store"
import { DEFAULT_MATERIAL, pictureOf } from "./materials"

/**
 * A picture of a material on its ball (see materials.ts), in the colour given: null
 * until it is drawn.
 */
export function useMaterialPicture(
  material: Material,
  chosen: PartMaterial | null,
  colour: string
): string | null {
  const key = `${material.id} ${colour} ${chosen?.roughness} ${chosen?.scale} ${chosen?.rotation}`
  const [drawn, setDrawn] = React.useState<{ key: string; url: string } | null>(
    null
  )
  React.useEffect(() => {
    let over = false
    void pictureOf(material, chosen, colour).then(
      (url) => {
        if (!over) setDrawn({ key, url })
      },
      () => {
        // drawn without a picture: the ball is left empty
      }
    )
    return () => {
      over = true
    }
    // (the key is all of what is drawn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // the last one drawn stands in while the next is drawn, so that a slider's ball does
  // not blink as it is dragged
  return drawn?.url ?? null
}

/** A material's ball, as big as it is given room for. */
export function MaterialBall({
  material,
  chosen,
  colour,
  className,
}: {
  material: Material
  chosen: PartMaterial | null
  colour: string
  className?: string
}) {
  const url = useMaterialPicture(material, chosen, colour)
  return (
    <span className={cn("block aspect-square", className)}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-contain"
        />
      ) : (
        <span className="block size-full scale-90 rounded-full bg-foreground/10" />
      )}
    </span>
  )
}

const said = (name: PaletteName) => name[0].toUpperCase() + name.slice(1)

type Tab = "colour" | "material"

/**
 * The colours and the materials there are for some parts, the part or all of a piece:
 * as each is chosen it is given them, and Cmd+Z takes it back. `shown` is the colour
 * the part is drawn in, "#rrggbb".
 */
export function LookPanel({
  partIds,
  shown,
  onGave,
}: {
  partIds: string[]
  shown: string
  /** a colour or a material was given */
  onGave: () => void
}) {
  const colour = useStore((state) => {
    const given = state.activeId ? state.colours[state.activeId] : undefined
    const first = given?.[partIds[0]] ?? null
    return partIds.every((id) => (given?.[id] ?? null) === first) ? first : null
  })
  const chosen = useStore((state) => {
    const given = state.activeId ? state.materials[state.activeId] : undefined
    const first = given?.[partIds[0]] ?? null
    return partIds.every(
      (id) => (given?.[id]?.material ?? null) === (first?.material ?? null)
    )
      ? first
      : null
  })
  const setColour = useStore((state) => state.setColour)
  const setMaterial = useStore((state) => state.setMaterial)
  const mode = useStore((state) => state.view.mode)
  const setView = useStore((state) => state.setView)
  const material = materialOf(chosen?.material)
  const [tab, setTab] = React.useState<Tab>(material ? "material" : "colour")
  // the material's own settings, once one is picked: or every one there is, to pick from
  const [browsing, setBrowsing] = React.useState(material === null)
  const [looking, setLooking] = React.useState("")
  const [seeking, setSeeking] = React.useState(false)
  const seek = React.useRef<HTMLInputElement>(null)
  // the search is out while it is being typed in, or has something in it
  const searching = seeking || looking !== ""

  const give = (next: PartColour) => {
    setColour(partIds, next)
    onGave()
  }
  const make = (next: PartMaterial | null) => {
    setMaterial(partIds, next)
    onGave()
  }
  const palette = currentPalette()
  // the colour the picker shows: the one given, as it is drawn
  const picked =
    colour === null
      ? shown
      : colour.startsWith("#")
        ? colour
        : palette[colour as PaletteName]

  const found = looking.trim().toLowerCase()
  const listed = [DEFAULT_MATERIAL, ...MATERIALS].filter(
    (one) =>
      !found ||
      `${one.name} ${one.finish} ${one.kind}`.toLowerCase().includes(found)
  )

  return (
    <div className="flex max-h-[min(40rem,85vh)] flex-col">
      <div
        role="tablist"
        className="flex shrink-0 border-b border-foreground/10"
      >
        {(
          [
            ["colour", "Color"],
            ["material", "Material"],
          ] as const
        ).map(([which, label]) => (
          <button
            key={which}
            type="button"
            role="tab"
            aria-selected={tab === which}
            onClick={() => {
              setTab(which)
              // materials are seen only in Render: go there to see them
              if (which === "material" && mode !== "render")
                setView({ mode: "render" })
            }}
            className={cn(
              "-mb-px flex-1 cursor-pointer border-b-2 py-3 text-sm font-medium outline-none focus-visible:bg-foreground/5",
              tab === which
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "colour" ? (
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <ColourPicker
            label="Color"
            hex="button"
            value={picked}
            onChange={(hex) => give(hex as PartColour)}
          />
          <div className="grid grid-cols-[repeat(6,1.75rem)] justify-between gap-y-3">
            {PALETTE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                title={said(name)}
                aria-pressed={colour === name}
                onClick={() => give(name)}
                className="size-7 cursor-pointer rounded-full outline-none hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-popover"
                style={{ background: palette[name] }}
              />
            ))}
          </div>
          {material && !material.tinted && (
            <p className="text-xs text-muted-foreground">
              {material.name} keeps its own color.
            </p>
          )}
        </div>
      ) : browsing || !material ? (
        <div className="flex min-h-0 flex-col">
          {/* a button with the glass on, that opens out into the field to search in */}
          <div
            className={cn(
              "mx-4 mt-3 flex h-9 shrink-0 items-center overflow-hidden rounded-full transition-[width,background-color] duration-200 ease-out",
              searching
                ? "w-[calc(100%-2rem)] bg-foreground/5 focus-within:ring-[3px] focus-within:ring-ring/50"
                : "w-9 bg-foreground/5 hover:bg-foreground/10"
            )}
          >
            <button
              type="button"
              tabIndex={searching ? -1 : 0}
              aria-label="Search materials"
              onClick={() => {
                setSeeking(true)
                seek.current?.focus()
              }}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <SearchIcon className="size-4" />
            </button>
            <input
              ref={seek}
              type="search"
              aria-label="Search materials"
              placeholder="Search"
              tabIndex={searching ? 0 : -1}
              value={looking}
              spellCheck={false}
              // (Esc here empties it and puts it away, and goes no further)
              data-keeps-escape={searching || undefined}
              onChange={(event) => setLooking(event.target.value)}
              onBlur={() => setSeeking(false)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                event.preventDefault()
                setLooking("")
                seek.current?.blur()
              }}
              className="min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 overflow-y-auto pt-1">
            {MATERIAL_KINDS.map(({ kind, label }) => {
              const these = listed.filter((one) => one.kind === kind)
              if (these.length === 0) return null
              return (
                <section
                  key={kind}
                  className="border-t border-foreground/10 px-4 py-3 first:border-t-0 last:pb-4"
                >
                  <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {label}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {these.map((one) => {
                      const on =
                        one === DEFAULT_MATERIAL
                          ? material === null
                          : material?.id === one.id
                      return (
                        <button
                          key={one.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            if (one === DEFAULT_MATERIAL) {
                              make(null)
                              return
                            }
                            make(
                              material?.id === one.id && chosen
                                ? chosen
                                : { material: one.id }
                            )
                            setBrowsing(false)
                          }}
                          className="flex cursor-pointer flex-col items-start gap-1 rounded-xl p-2 text-left outline-none hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-foreground/10"
                        >
                          <MaterialBall
                            material={one}
                            chosen={null}
                            colour={shown}
                            className="w-full"
                          />
                          <span className="text-xs leading-tight font-medium">
                            {one.name}
                          </span>
                          <span className="text-xs leading-tight text-muted-foreground">
                            {one.finish}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
            {listed.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No material by that name
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <div className="relative">
            <button
              type="button"
              title="All materials"
              onClick={() => setBrowsing(true)}
              className="absolute top-0 left-0 flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ArrowLeftIcon className="size-4" />
              <span className="sr-only">All materials</span>
            </button>
            <MaterialBall
              material={material}
              chosen={chosen}
              colour={shown}
              className="mx-auto w-48"
            />
          </div>
          <div>
            <p className="text-base font-medium">{material.name}</p>
            <p className="text-sm text-muted-foreground">{material.finish}</p>
          </div>
          <Setting
            label="Roughness"
            value={chosen?.roughness ?? MATERIAL_SETTINGS.roughness.initial}
            {...MATERIAL_SETTINGS.roughness}
            said={(value) => `${value.toFixed(1)}×`}
            onChange={(roughness) => make({ ...chosen!, roughness })}
          />
          {hasGrain(material) && (
            <>
              <Setting
                label="Scale"
                value={chosen?.scale ?? MATERIAL_SETTINGS.scale.initial}
                {...MATERIAL_SETTINGS.scale}
                said={(value) => `${value.toFixed(1)}×`}
                onChange={(scale) => make({ ...chosen!, scale })}
              />
              <Setting
                label="Rotation"
                value={chosen?.rotation ?? MATERIAL_SETTINGS.rotation.initial}
                {...MATERIAL_SETTINGS.rotation}
                said={(value) => `${Math.round(value)}°`}
                onChange={(rotation) => make({ ...chosen!, rotation })}
              />
            </>
          )}
        </div>
      )}

      {tab === "material" && mode !== "render" && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-foreground/10 px-4 py-2.5 text-xs text-muted-foreground">
          <span>Materials show in Render</span>
          <button
            type="button"
            onClick={() => setView({ mode: "render" })}
            className="cursor-pointer rounded-full px-2.5 py-1 font-medium text-foreground hover:bg-foreground/10"
          >
            Show
          </button>
        </div>
      )}
    </div>
  )
}

/** One of a material's settings: what it is, a slider, and what it is at. */
function Setting({
  label,
  value,
  min,
  max,
  step,
  said,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  said: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {said(value)}
        </span>
      </div>
      <PillSlider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        className="w-full"
      />
    </div>
  )
}
