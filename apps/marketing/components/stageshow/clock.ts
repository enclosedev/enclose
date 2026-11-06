// The stage clock. Everything on a stage moves on the browser's own clocks:
// performance.now, requestAnimationFrame, setTimeout/setInterval, and CSS
// transitions and animations on the compositor. With nothing attached, that
// is all this file is: `clock` reads those same globals, so a stage plays in
// real time exactly as it always has.
//
// A recorder that installs a virtual clock at window.__stageshow.clock (the kit's,
// not kept here: nothing on this site is recorded with it) moves time instead.

/** What a recorder drives, at window.__stageshow.clock once installed. */
export interface ClockControl {
  readonly fps: number
  /** Render updates since install; fixed frames when driven by step(). */
  readonly frame: number
  /** Virtual ms, what performance.now() returns. */
  now(): number
  /**
   * Advance `frames` frames (1 by default). Per frame: timers due by the new
   * time fire in order, each followed by the work it queued (React commits,
   * promise chains); then one round of animation frames; then every CSS
   * transition and animation is moved to the new time.
   */
  step(frames?: number): Promise<void>
  /** Advance live playback by elapsed milliseconds, rendering one update. */
  advance(milliseconds: number): Promise<void>
  /** Let queued tasks run without moving time, and hold any CSS animation that started meanwhile. */
  settle(): Promise<void>
  /** Stage measurement callbacks, separate from motion frames. */
  requestLayoutFrame(callback: FrameRequestCallback): number
  cancelLayoutFrame(id: number): void
  readonly layoutPending: boolean
  /** Run one round of layout callbacks without advancing time, timers or motion. */
  flushLayout(): Promise<void>
}

type Host = { __stageshow?: { clock?: ClockControl } }

/**
 * The clock the kit and its scenes read. Each call goes to the page's global
 * at call time, so under a recorder it is the virtual clock and otherwise
 * the real one.
 */
export const clock = {
  now: (): number => performance.now(),
  raf: (fn: FrameRequestCallback): number => requestAnimationFrame(fn),
  cancelRaf: (id: number): void => cancelAnimationFrame(id),
  // Layout must finish even when a preview is paused. Keep these callbacks
  // separate: running arbitrary motion RAFs at a frozen timestamp can still
  // advance a spring that integrates once per callback.
  layoutRaf: (fn: FrameRequestCallback): number => clock.recording?.requestLayoutFrame(fn) ?? requestAnimationFrame(fn),
  cancelLayoutRaf: (id: number): void => {
    const recording = clock.recording
    if (recording) recording.cancelLayoutFrame(id)
    else cancelAnimationFrame(id)
  },
  timeout: (fn: () => void, ms: number): number => window.setTimeout(fn, ms),
  clearTimeout: (id: number): void => window.clearTimeout(id),
  /** The recorder's control while one drives the page, else null. */
  get recording(): ClockControl | null {
    return typeof window === 'undefined' ? null : ((window as unknown as Host).__stageshow?.clock ?? null)
  },
}
