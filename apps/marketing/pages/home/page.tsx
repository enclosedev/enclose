import { useMotion } from '@modulato/gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import gsapCore from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { WINDOW } from '../../components/app/data'
import { Window } from '../../components/app/Window'
import type { Look } from '../../components/app/look'
import type { Frame, View } from '../../components/app/view'
import { Download } from '../../components/Download'
import { Showcase } from '../../components/features/Showcase'
import { Footer } from '../../shell/Footer'
import { GROUPS } from './features'
import { runIntro } from './intro'
import { Tinker } from './Tinker'

gsapCore.registerPlugin(ScrollTrigger)

export default function Home({ headline, description }: { headline: string; description: string }) {
  const view = useRef<View | null>(null)
  const intro = useRef<ReturnType<typeof runIntro> | null>(null)
  const [ready, setReady] = useState(false)

  useMotion(({ gsap }) => {
    const root = document.querySelector<HTMLElement>('.home')
    if (!root) return
    const running = runIntro({
      gsap,
      root,
      draw: (look: Look, frame?: Frame) => view.current?.draw(look, frame),
      resize: (width: number, height: number) => view.current?.resize(width, height),
    })
    intro.current = running
    return () => {
      running.stop()
      intro.current = null
    }
  })

  // The model is fetched once the page is up, and three.js with it: neither is in
  // what the page needs to be read.
  // Where the window comes apart, the model is in a studio of its own, the size of the
  // screen, behind the window (see intro.ts); otherwise it is in the window's view.
  useEffect(() => {
    // (as intro.ts decides it)
    const studio = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = document.querySelector<HTMLCanvasElement>(
      studio ? '[data-app="studio"]' : '[data-app="canvas"]',
    )
    if (!canvas) return
    let gone = false
    const ratio = () => Math.min(2, Math.max(1, window.devicePixelRatio))
    const sharpen = () => view.current?.sharpen(ratio())
    void import('../../components/app/view')
      .then(({ openView }) => openView(canvas, ratio(), {}, { studio }))
      .then((opened) => {
        if (gone) return opened.dispose()
        view.current = opened
        intro.current?.arrive()
        canvas.dataset.ready = ''
        setReady(true)
        window.addEventListener('resize', sharpen)
      })
      .catch(() => {})
    return () => {
      gone = true
      window.removeEventListener('resize', sharpen)
      view.current?.dispose()
      view.current = null
      setReady(false)
    }
  }, [])

  return (
    <main className="home">
      {/* The first screen. Where it can move, it is the arm by itself in the dark, in a
          studio, someone at work on it (Tinker.tsx), and the app put together round it
          as the page is scrolled (intro.ts); otherwise the window as it is, under the
          words. */}
      <section className="home__top" suppressHydrationWarning>
        <div className="home__pin">
          <canvas className="home__studio" data-app="studio" />
          <Tinker view={view} ready={ready} />
          {/* whose the arm is (NOTICE.md) */}
          <p className="home__credit">
            <span>
              The arm is the SO-101, open-sourced by{' '}
              <a href="https://github.com/TheRobotStudio/SO-ARM100" target="_blank" rel="noreferrer">
                TheRobotStudio
              </a>
            </span>
          </p>
          {/* that there is more, further down */}
          <div className="home__cue" aria-hidden>
            <span>
              <i />
            </span>
          </div>
          <div className="home__hero">
            {/* (a word with a hyphen in it is kept on one line: "open-source") */}
            <h1 className="home__headline">
              {headline.split(/(\S+-\S+)/).map((part, index) =>
                index % 2 ? <span key={index}>{part}</span> : part,
              )}
            </h1>
            <p className="home__lede">{description}</p>
            <Download />
          </div>
          <div className="home__window" suppressHydrationWarning>
            <Window />
          </div>
        </div>
        {/* Worked out as the page is read, so that the first screen is right the first
            time it is drawn: whether the window comes apart (not where motion is to be
            kept down); or, if it stays as it is, how many times its own width goes into
            the room it has. (intro.ts does the rest.) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(t){if(!t)return;var w=t.querySelector('.home__window');if(matchMedia('(prefers-reduced-motion: reduce)').matches)w.style.setProperty('--fit',w.offsetWidth/${WINDOW.width});else t.setAttribute('data-spatial','')})(document.currentScript.parentElement)`,
          }}
        />
      </section>

      {GROUPS.map((group) => (
        <Showcase key={group.id} group={group} />
      ))}

      <section className="home__end">
        {/* one paragraph, as each group's heading is (components/features/showcase.scss) */}
        <h2 className="home__last showcase__heading">
          Make something. <span>Enclose is free and open source, for macOS and Linux.</span>
        </h2>
        <Download />
      </section>
      <Footer />
    </main>
  )
}
