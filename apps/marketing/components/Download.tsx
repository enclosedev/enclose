import { useEffect, useState } from 'react'
import { REPOSITORY } from '../shell/Header'
import { AppleIcon, LinuxIcon } from './app/icons'

/**
 * The site's own ways to the newest disk image of each kind, which it sends on to
 * GitHub (vite.config.ts). They need no script, and nothing asked of anyone.
 */
const WAY: Record<'silicon' | 'intel', string> = { silicon: '/download', intel: '/download/intel' }
/**
 * And for Linux, the newest release itself: its files are named for their version, so
 * there is no one address for any of them until GitHub has said which release that is.
 */
const RELEASES = `${REPOSITORY}/releases/latest`

type Chip = 'silicon' | 'intel'
type Arch = 'x86_64' | 'arm64'
type Release = { version: string } & Record<Chip, string> & Partial<Record<Arch, string>>
type System = 'mac' | 'linux'

/** What is said of each, under the buttons, while one is pointed at. */
const SAID: Record<Chip | Arch, string> = {
  silicon: 'for Apple Silicon',
  intel: 'for Intel Macs',
  x86_64: 'for Linux (AppImage)',
  arm64: 'for ARM Linux (AppImage)',
}

/**
 * The newest release, asked of GitHub by whoever is reading the page: its files are
 * named for their version, so there is no one address that is always the newest. Of
 * the Linux kinds the AppImage is offered, which runs on any of them and updates itself.
 */
async function newest(): Promise<Release | null> {
  const response = await fetch('https://api.github.com/repos/enclosedev/enclose/releases/latest', {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!response.ok) return null
  const release = (await response.json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }
  const file = (ending: string) =>
    release.assets.find((asset) => asset.name.endsWith(ending))?.browser_download_url
  const silicon = file('arm64.dmg')
  const intel = file('x64.dmg')
  if (!silicon || !intel) return null
  return {
    version: release.tag_name.replace(/^v/, ''),
    silicon,
    intel,
    x86_64: file('-x86_64.AppImage'),
    arm64: file('-arm64.AppImage'),
  }
}

/** What Chrome and its kin say outright of the machine they are on, where they say it. */
type Said = {
  platform: string
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>
}
const said = () => (navigator as Navigator & { userAgentData?: Said }).userAgentData
const architectureOf = (from: Said) =>
  from
    .getHighEntropyValues(['architecture'])
    .then(({ architecture }) => architecture)
    .catch(() => undefined)

/**
 * Which kind of Mac the page is being read on, as far as a browser will say. Chrome
 * and its kin say outright. Safari and Firefox call every Mac an Intel one, so there
 * it is told by the graphics: by its name where the browser gives one, and otherwise
 * by the kinds of packed texture it takes, which Apple's own chips do and the Intel
 * Macs' do not. Nothing, where it cannot be told or is no Mac at all.
 */
async function chipOf(): Promise<Chip | null> {
  const from = said()
  if (from) {
    if (from.platform !== 'macOS') return null
    const architecture = await architectureOf(from)
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

/**
 * Which kind of Linux machine the page is being read on: an ARM one where the browser
 * says so, and otherwise the x86_64 that most are, and that is taken for any page not
 * read on Linux at all.
 */
async function archOf(): Promise<Arch> {
  const from = said()
  if (from?.platform === 'Linux') {
    const architecture = await architectureOf(from)
    if (architecture === 'arm') return 'arm64'
    if (architecture === 'x86') return 'x86_64'
  }
  return /Linux (aarch64|arm64)/i.test(navigator.userAgent) ? 'arm64' : 'x86_64'
}

/**
 * The way to the app, a round button for each system: the disk image for the kind of
 * Mac the page is read on, taken for Apple Silicon where it cannot be told, and the
 * AppImage for the kind of Linux machine. Under them is the version, and while one of
 * them is pointed at, which file it is. The Mac button goes by the site's own way to
 * the newest image, which is always right, and the Linux one to the newest release;
 * once GitHub has said which release that is, each goes straight to its file.
 */
export function Download() {
  const [release, setRelease] = useState<Release | null>(null)
  const [chip, setChip] = useState<Chip>('silicon')
  const [arch, setArch] = useState<Arch>('x86_64')
  const [over, setOver] = useState<System | null>(null)
  useEffect(() => {
    let gone = false
    void newest().then(
      (found) => !gone && setRelease(found),
      () => {},
    )
    void chipOf().then(
      (found) => !gone && found && setChip(found),
      () => {},
    )
    void archOf().then(
      (found) => !gone && setArch(found),
      () => {},
    )
    return () => {
      gone = true
    }
  }, [])

  const pointing = (system: System) => ({
    onPointerEnter: () => setOver(system),
    onPointerLeave: () => setOver((was) => (was === system ? null : was)),
    onFocus: () => setOver(system),
    onBlur: () => setOver((was) => (was === system ? null : was)),
  })
  const which = over === 'mac' ? SAID[chip] : over === 'linux' ? SAID[arch] : null
  const note = [release && `Version ${release.version}`, which].filter(Boolean).join(', ')

  return (
    <div className="download">
      <div className="download__buttons">
        <a
          className="download__button"
          href={release?.[chip] ?? WAY[chip]}
          aria-label={`Download for Mac, ${SAID[chip]}`}
          data-native
          {...pointing('mac')}
        >
          <AppleIcon />
        </a>
        <a
          className="download__button"
          href={release?.[arch] ?? RELEASES}
          aria-label={`Download ${SAID[arch]}`}
          data-native
          {...pointing('linux')}
        >
          <LinuxIcon />
        </a>
      </div>
      {/* (a line held open while there is nothing to say, so the page does not move) */}
      <p className="download__note">
        {note ? `${note.charAt(0).toUpperCase()}${note.slice(1)}.` : ' '}
      </p>
    </div>
  )
}
