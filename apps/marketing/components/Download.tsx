import { useEffect, useRef, useState } from 'react'
import { Download as DownloadIcon } from 'lucide-react'
import { REPOSITORY } from '../shell/Header'
import { AppleIcon } from './app/icons'

/**
 * The release the page offers, and GitHub's own API for it: both are built from the
 * one place the repository is named (shell/Header), and the API knows it as
 * `owner/name`.
 */
const RELEASES = `${REPOSITORY}/releases/latest`
const REPO = new URL(REPOSITORY).pathname.replace(/^\//, '')

/**
 * The site's own ways to the newest disk image of each kind, which it sends on to
 * GitHub (vite.config.ts). They need no script, and nothing asked of anyone. Linux
 * has none: its files are named for their version, so there is no one address that
 * is always the newest, and the page goes straight to the files once GitHub has
 * said which release that is.
 */
const WAY: Record<'silicon' | 'intel', string> = { silicon: '/download', intel: '/download/intel' }

type Chip = 'silicon' | 'intel'
type System = 'mac' | 'linux'
type Release = {
  version: string
  silicon: string | null
  intel: string | null
  /** each Linux kind, where the release has one; only x86_64 is built today */
  appimage: string | null
  deb: string | null
  pacman: string | null
  rpm: string | null
}

const SAID: Record<Chip, string> = {
  silicon: 'for Apple Silicon',
  intel: 'for Intel Macs',
}

/** The other Linux kinds beside the AppImage, each with its one-line install. */
const KINDS = [
  { key: 'deb', ending: 'Debian, Ubuntu', install: (file: string) => `sudo apt install ./${file}` },
  { key: 'pacman', ending: 'Arch', install: (file: string) => `sudo pacman -U ${file}` },
  { key: 'rpm', ending: 'Fedora', install: (file: string) => `sudo dnf install ./${file}` },
] as const

/** A file's name, taken from the address GitHub gave it. */
const fileOf = (url: string) => url.split('/').at(-1) ?? url

/**
 * The newest release, asked of GitHub by whoever is reading the page: its files are
 * named for their version, so there is no one address that is always the newest.
 */
async function newest(): Promise<Release | null> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!response.ok) return null
  const release = (await response.json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }
  const image = (ending: string) =>
    release.assets.find((asset) => asset.name.endsWith(`${ending}.dmg`))?.browser_download_url
  const silicon = image('arm64') ?? null
  const intel = image('x64') ?? null
  const file = (ending: string) =>
    release.assets.find((asset) => asset.name.endsWith(ending))?.browser_download_url ?? null
  const appimage = file('-x86_64.AppImage')
  const deb = file('-amd64.deb')
  const pacman = file('-x64.pacman')
  const rpm = file('-x86_64.rpm')
  // a release of nothing the page offers is none to show: callers fall back to
  // the site's own ways to the images
  if (!silicon && !intel && !appimage && !deb && !pacman && !rpm) return null
  return {
    version: release.tag_name.replace(/^v/, ''),
    silicon,
    intel,
    appimage,
    deb,
    pacman,
    rpm,
  }
}

/**
 * Which kind of Mac the page is being read on, as far as a browser will say. Chrome
 * and its kin say outright. Safari and Firefox call every Mac an Intel one, so there
 * it is told by the graphics: by its name where the browser gives one, and otherwise
 * by the kinds of packed texture it takes, which Apple's own chips do and the Intel
 * Macs' do not. Nothing, where it cannot be told or is no Mac at all.
 */
async function chipOf(): Promise<Chip | null> {
  const said = (
    navigator as Navigator & {
      userAgentData?: {
        platform: string
        getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>
      }
    }
  ).userAgentData
  if (said) {
    if (said.platform !== 'macOS') return null
    const { architecture } = await said.getHighEntropyValues(['architecture']).catch(() => ({
      architecture: undefined,
    }))
    if (architecture === 'arm') return 'silicon'
    if (architecture === 'x86') return 'intel'
  }
  if (!/Macintosh/.test(navigator.userAgent)) return null

  const gl = document.createElement('canvas').getContext('webgl')
  if (!gl) return null
  const named = gl.getExtension('WEBGL_debug_renderer_info')
  const graphics = named ? String(gl.getParameter(named.UNMASKED_RENDERER_WEBGL)) : ''
  const takes = gl.getSupportedExtensions() ?? []
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  if (/Apple M\d/.test(graphics)) return 'silicon'
  if (/Intel|Radeon|AMD|NVIDIA|GeForce/i.test(graphics)) return 'intel'
  if (takes.some((one) => /compressed_texture_(astc|etc)$/.test(one))) return 'silicon'
  if (takes.some((one) => /compressed_texture_s3tc$/.test(one))) return 'intel'
  return null
}

/** Which system the page is being read on: a Mac, Linux, or neither that is said. */
async function systemOf(): Promise<{ system: System; chip: Chip }> {
  const said = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData
  // An Android phone calls itself Linux too ("Linux; Android"), and it is no place
  // for a desktop AppImage, so it is left out.
  const linux = !/Android/i.test(navigator.userAgent)
  if (linux && (said?.platform === 'Linux' || /Linux/.test(navigator.userAgent)))
    return { system: 'linux', chip: 'silicon' }
  return { system: 'mac', chip: (await chipOf().catch(() => null)) ?? 'silicon' }
}

/**
 * The way to the app, for the system it is asked for: the disk image for the kind of
 * Mac, which is taken for Apple Silicon where it cannot be told, and under it which
 * that is; and on Linux, the AppImage, with the other kinds under it. The Mac buttons
 * go by the site's own way to the newest image, which is always right; once GitHub
 * has said which release that is, each goes straight to its file, and the version is
 * said under it.
 */
export function Download() {
  const [release, setRelease] = useState<Release | null>(null)
  const [system, setSystem] = useState<System>('mac')
  const [chip, setChip] = useState<Chip>('silicon')
  // Whether the reader has picked a system by hand: the one read from the browser
  // must not take that back from them once they have.
  const chosen = useRef(false)
  useEffect(() => {
    let gone = false
    void newest().then(
      (found) => !gone && setRelease(found),
      () => {},
    )
    void systemOf().then(
      (found) => {
        if (gone) return
        if (!chosen.current) setSystem(found.system)
        setChip(found.chip)
      },
      () => {},
    )
    return () => {
      gone = true
    }
  }, [])

  return (
    <div className="download">
      <div className="download__systems" role="group" aria-label="System">
        {(['mac', 'linux'] as const).map((one) => (
          <button
            key={one}
            type="button"
            className="download__system"
            aria-pressed={system === one}
            onClick={() => {
              chosen.current = true
              setSystem(one)
            }}
          >
            {one === 'mac' ? 'Mac' : 'Linux'}
          </button>
        ))}
      </div>
      {system === 'linux' ? (
        <LinuxDownload release={release} />
      ) : (
        <>
          <a className="download__button" href={release?.[chip] ?? WAY[chip]} data-native>
            <AppleIcon />
            Download for Mac
          </a>
          <p className="download__note">
            {release ? `Version ${release.version}, ${SAID[chip]}.` : `${SAID[chip].replace(/^f/, 'F')}.`}
          </p>
        </>
      )}
    </div>
  )
}

function LinuxDownload({ release }: { release: Release | null }) {
  const kinds = KINDS.flatMap((kind) => {
    const url = release?.[kind.key]
    if (!url) return []
    return [{ ...kind, url, file: fileOf(url) }]
  })
  const appimage = release?.appimage ? fileOf(release.appimage) : null
  return (
    <>
      <a className="download__button" href={release?.appimage ?? RELEASES} data-native>
        <DownloadIcon />
        Download for Linux
      </a>
      <p className="download__note">
        {!release ? (
          'For x86_64. See the newest release on GitHub.'
        ) : release.appimage ? (
          <>
            Version {release.version}, AppImage for x86_64. From the folder you downloaded it
            to, <code>chmod +x {appimage}</code>, then run it. Ubuntu 22.04 and newer also
            need libfuse2 (<code>sudo apt install libfuse2</code>).
          </>
        ) : (
          `Version ${release.version} has no Linux build yet.`
        )}
      </p>
      {kinds.length > 0 && (
        <>
          <p className="download__note">Run these from the folder you downloaded to.</p>
          <ul className="download__more">
            {kinds.map((kind) => (
              <li key={kind.key}>
                <a href={kind.url} data-native>
                  {kind.file}
                </a>{' '}
                for {kind.ending}: <code>{kind.install(kind.file)}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="download__note">
        <a href={RELEASES} data-native>
          All downloads on GitHub.
        </a>
      </p>
    </>
  )
}
