import { typography } from 'modulato'

/**
 * The type system — every text style in the project, as DATA.
 *
 * Same idea as `motion.ts`, applied to type: a size or a leading is a number
 * somebody will want to nudge while looking at the page, so it lives in a file
 * that can be read, edited and written back — not spread across stylesheets as
 * literals. Modulato turns this into CSS custom properties (`--type-body-size`
 * and friends) and one utility class per style (`.type-body`), inlined into
 * every SSR response so the first paint is already typeset.
 *
 * Two ways to wear a style: `@include type.style('body')` from a page
 * stylesheet (see styles/typography.scss), or `class="type-body"` in JSX.
 * Either way the element is stamped with the style's name, which is what lets
 * the Tweak overlay's Type Mode answer "what am I looking at" when you click
 * a heading in the browser.
 *
 * NEVER declare font-family, font-size, line-height or letter-spacing in a
 * page stylesheet. Add or change a style here, and the whole site follows.
 *
 * Given a design to implement: encode its type scale and its styles HERE
 * first, then build pages out of them.
 */
export default typography({
  // Named font stacks — `--type-font-<key>`. Inter is loaded in app.tsx, and
  // styles/global.scss holds it at its display optical size.
  fonts: {
    sans: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
    // the app's, for a colour as "#rrggbb"
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },

  // The viewport range a fluid `{ min, max }` step crosses, stated once for
  // the whole scale. Only read by steps written as a pair — a plain number is
  // one size at every width.
  fluid: { from: 390, to: 1440 },

  // The size steps this project uses, and the only ones it uses. A closed set
  // is what keeps a site to a scale instead of to forty-one accidental sizes:
  // Tweak's size control steps THROUGH these rather than offering a free
  // pixel slider.
  //
  // A number is the size in PX AS DESIGNED — write what the design says, 18.
  // Modulato ships it in rem, so a reader who has raised their browser's font
  // size gets larger text without the layout inflating around it. You never
  // write the unit; the framework owns that decision (and layout, in the
  // stylesheets, stays in px for the other half of the same reason).
  //
  // A step that should grow with the viewport is its two ends, and Modulato
  // solves the line between them: `display: { min: 44, max: 90 }` is 44px at
  // 390 and 90px at 1440. Two numbers rather than a `clamp()` string because
  // numbers are what Tweak can put a slider on.
  scale: {
    // The page: one size for what is said, and a smaller one beside it.
    small: 14,
    prose: 18,
    text: { min: 16, max: 18 },
    // what the first page says first, on a phone: the one thing there that is bigger
    lead: 22,
    title: { min: 28, max: 40 },
    // what each group of features down the first page is called
    section: { min: 34, max: 52 },
    // The app's window, rebuilt on the page: the sizes the app itself is set in.
    'ui-xs': 12,
    'ui-sm': 14,
    'ui-base': 16,
  },

  // Type Mode's "save to this class" adds an `overrides` block here — one
  // selector departing from its style:
  //
  //   overrides: { '.home__headline': { style: 'headline', leading: 1.05 } }
  //
  // They are emitted as custom properties SCOPED to the selector, so they win
  // wherever the element's own font declarations came from — no specificity
  // fight, and nothing to keep in stylesheet order.
  //
  // Left out until there is one: an empty literal is a key recast has to patch
  // INSIDE, and it reprints those with its own indentation rather than the
  // file's.
  styles: {
    // Everything the page says is one size: the heading is heavier, not bigger.
    headline: {
      font: 'sans',
      size: 'text',
      leading: 1.2,
      tracking: -0.012,
      weight: 500,
      wrap: 'balance',
    },
    // What the first page says first, and under it, quieter, what it goes on to say
    // (`lede`). On a wide screen they are the size of everything else; on a phone,
    // where they are the first thing read and there is little else in sight, they
    // are bigger.
    hero: {
      font: 'sans',
      size: 'text',
      leading: 1.2,
      tracking: -0.012,
      weight: 500,
      wrap: 'balance',
      phone: { size: 'lead', leading: 1.2, tracking: -0.02 },
    },
    lede: {
      font: 'sans',
      size: 'text',
      leading: 1.3,
      tracking: -0.012,
      weight: 400,
      wrap: 'balance',
      phone: { size: 'lead', leading: 1.2, tracking: -0.02 },
    },
    body: {
      font: 'sans',
      size: 'text',
      leading: 1.3,
      tracking: -0.012,
      weight: 400,
      wrap: 'balance',
    },
    small: {
      font: 'sans',
      size: 'small',
      leading: 1.4,
      tracking: 0,
      weight: 400,
      wrap: 'balance',
    },
    // The name over each group of features down the first page: the biggest thing on it.
    section: {
      font: 'sans',
      size: 'section',
      leading: 1.05,
      tracking: -0.03,
      weight: 500,
      wrap: 'balance',
    },
    // The terms and the privacy page: long text, set to be read.
    title: {
      font: 'sans',
      size: 'title',
      leading: 1.1,
      tracking: -0.025,
      weight: 500,
      wrap: 'balance',
    },
    prose: {
      font: 'sans',
      size: 'prose',
      leading: 1.39,
      tracking: -0.005,
      weight: 400,
      wrap: 'balance',
    },
    // The app's window. `ui` is a card or a control, `ui-tight` the tools panel,
    // `ui-text` what is said in the conversation, `ui-title` a name over
    // something and `ui-head` the name over a blueprint sheet.
    ui: { font: 'sans', size: 'ui-xs', leading: 1.4, tracking: 0, weight: 400 },
    'ui-tight': { font: 'sans', size: 'ui-xs', leading: 1.333, tracking: 0, weight: 400 },
    'ui-text': { font: 'sans', size: 'ui-sm', leading: 1.625, tracking: 0, weight: 400 },
    'ui-title': { font: 'sans', size: 'ui-sm', leading: 1.43, tracking: 0, weight: 500 },
    'ui-head': { font: 'sans', size: 'ui-base', leading: 1.5, tracking: 0, weight: 500 },
    // a colour, as "#rrggbb" (the colour picker's)
    'ui-code': { font: 'mono', size: 'ui-xs', leading: 1.4, tracking: 0, weight: 400 },
  },

  overrides: {
    '.showcase__heading': {
      style: 'section',
      size: 'section',
      leading: 1.01,
      tracking: -0.028
    }
  }
})
