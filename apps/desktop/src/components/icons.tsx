// The icons lucide has no drawing for. Same grid and stroke as lucide's, so they sit
// beside its icons without looking like visitors.
import * as React from "react"

type IconProps = React.ComponentProps<"svg">

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

// a cube seen corner-on, as lucide draws its box: the outline, then its three faces
const CUBE =
  "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
const TOP = "M12 12 3.3 7 12 2l8.7 5Z"
const LEFT = "M12 12v10l-8.7-5V7Z"
const RIGHT = "M12 12l8.7-5v10L12 22Z"
const NEAR_EDGES = "m3.3 7 8.7 5 8.7-5M12 22V12"
const FAR_EDGES = "M12 12V2.5M12 12l-8.7 5M12 12l8.7 5"

/** Parts drawn as they are: opaque. */
export function SolidIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g stroke="none" fill="currentColor">
        <path d={TOP} fillOpacity="0.95" />
        <path d={LEFT} fillOpacity="0.6" />
        <path d={RIGHT} fillOpacity="0.32" />
      </g>
      <path d={CUBE} />
    </Icon>
  )
}

/** The model drawn see-through, so what is inside anything shows. */
export function GlassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d={CUBE} strokeOpacity="0.55" />
      <path
        d="M12 7.4 16 9.7v4.6l-4 2.3-4-2.3V9.7Z"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  )
}

/** Edges only, as far as the body itself does not hide them. */
export function WireframeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d={CUBE} />
      <path d={NEAR_EDGES} />
    </Icon>
  )
}

/**
 * As it would look made: a ball lit from above, with the shine of the light on it and
 * its shadow on the floor under it.
 */
export function RenderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="10.5" r="7.5" />
      <path d="M8.2 8.2a4.2 4.2 0 0 1 3-2.4" />
      <ellipse
        cx="12"
        cy="21"
        rx="5"
        ry="1"
        fill="currentColor"
        stroke="none"
        opacity="0.5"
      />
    </Icon>
  )
}

/** Edges only, the hidden ones included. */
export function OutlineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d={CUBE} />
      <path d={NEAR_EDGES} />
      <path d={FAR_EDGES} strokeWidth="1.25" strokeDasharray="1.5 2.5" />
    </Icon>
  )
}

/** A body cut through: one half whole, the other showing its hatched cut face. */
export function SectionIcon(props: IconProps) {
  const clip = React.useId()
  return (
    <Icon {...props}>
      <defs>
        <clipPath id={clip}>
          <path d="M5 12V9a7 7 0 0 1 14 0v3Z" />
        </clipPath>
      </defs>
      <path d="M5 12v3a7 7 0 0 0 14 0v-3Z" fill="currentColor" />
      <path d="M5 12V9a7 7 0 0 1 14 0v3" />
      <path
        clipPath={`url(#${clip})`}
        strokeWidth="1.75"
        d="M3 9.5 10.5 2M5 13 16 2M10 13.5 20.5 3M15.5 13.5l6-6"
      />
    </Icon>
  )
}

/**
 * A circuit board: lucide's, without the square round it. Two pads, and the trace from
 * each to the edge of the board, which is all of it there is to see.
 */
export function BoardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11 9h4a2 2 0 0 0 2-2V3" />
      <circle cx="9" cy="9" r="2" />
      <path d="M7 21v-4a2 2 0 0 1 2-2h4" />
      <circle cx="15" cy="15" r="2" />
    </Icon>
  )
}

/** A thing on a table: something of a known size for it to be seen beside. */
export function ReferenceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 13V7.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V13" />
      <path d="M3 13h18M6 13v7.5M18 13v7.5" />
    </Icon>
  )
}

/**
 * A star with straight sides and sharp points, which marks a favourite: in a line for
 * one that is not, and filled for one that is. The line is a pixel wide at any size.
 */
export function StarIcon({
  filled,
  ...props
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1"
      strokeLinejoin="miter"
      aria-hidden
      {...props}
    >
      <path
        vectorEffect="non-scaling-stroke"
        d="M12 2.95 14.245 9.86h7.266l-5.878 4.27 2.245 6.91L12 16.77l-5.878 4.27 2.245-6.91L2.489 9.86h7.266Z"
      />
    </svg>
  )
}

/** Claude's mark, in Claude's colour: whose models these are. */
export function ClaudeIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="#d97757"
      aria-hidden
      {...props}
    >
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  )
}

/** OpenAI's mark, whose agent Codex is: in whatever colour the words beside it are. */
export function OpenAIIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 256 260"
      preserveAspectRatio="xMidYMid"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
    </svg>
  )
}

/** Grok's mark, likewise. */
export function GrokIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="M9.26905 15.284L17.2479 9.36086C17.6391 9.07047 18.1981 9.18374 18.3845 9.63478C19.3655 12.0135 18.9272 14.8721 16.9755 16.8349C15.0238 18.7976 12.3082 19.228 9.8261 18.2477L7.1146 19.5102C11.0037 22.1834 15.7263 21.5223 18.6774 18.5525C21.0182 16.1985 21.7432 12.9897 21.0653 10.0961L21.0714 10.1023C20.0884 5.85143 21.3131 4.15233 23.8218 0.677913C23.8812 0.595532 23.9406 0.513151 24 0.428711L20.6987 3.74866V3.73836L9.267 15.2861" />
      <path d="M7.62249 16.7237C4.83113 14.0422 5.3124 9.89222 7.69417 7.49905C9.45541 5.72786 12.341 5.00497 14.86 6.06768L17.5653 4.81138C17.0779 4.45714 16.4533 4.07613 15.7365 3.80839C12.4966 2.46764 8.6178 3.13492 5.98413 5.78141C3.45081 8.32904 2.65415 12.2463 4.02219 15.5889C5.04412 18.0871 3.36889 19.8541 1.68137 21.6377C1.08337 22.2699 0.483318 22.9022 0 23.5716L7.62045 16.7257" />
    </svg>
  )
}

/** Whose agent it is: the mark of each, which is how they are told apart at a glance. */
export function ProviderIcon({
  provider,
  ...props
}: IconProps & { provider: "claude" | "codex" | "grok" | "opencode" }) {
  const Mark =
    provider === "claude"
      ? ClaudeIcon
      : provider === "codex"
        ? OpenAIIcon
        : provider === "grok"
          ? GrokIcon
          : OpencodeIcon
  return <Mark {...props} />
}

/**
 * opencode's mark: a terminal's prompt, drawn the way lucide draws its terminal, so it
 * sits beside the others without looking like a visitor. (Not its logo: there is no
 * drawing of opencode's to borrow here.)
 */
function OpencodeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </Icon>
  )
}
