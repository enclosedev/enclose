import { Legal } from '../../components/Legal'
import { REPOSITORY } from '../../shell/Header'

export default function Terms() {
  return (
    <Legal page="terms" title="Terms of Use" updated="15 October 2026">
      <p>
        Enclose is an open-source project maintained by Glauber. These terms cover this
        website and the Enclose app as it is downloaded from the project’s releases. Using
        either means you accept them.
      </p>

      <h2>The app is open source</h2>
      <p>
        The app’s code is under the{' '}
        <a href={`${REPOSITORY}/blob/main/LICENSE`}>GNU Affero General Public License, version 3</a>,
        with the added permission and the notes in{' '}
        <a href={`${REPOSITORY}/blob/main/NOTICE.md`}>NOTICE.md</a>. That license says what you
        may do with the code: use it, change it and pass it on. Nothing here takes any of that
        away, and where these terms and the license disagree about the software, the license
        is what counts.
      </p>
      <p>
        The name Enclose and its mark are not licensed with the code. A fork goes by a name
        and a mark of its own.
      </p>

      <h2>Your projects are yours</h2>
      <p>
        A project is a folder on your machine. The models, the files and what is said about
        them are yours and stay there. The project runs no server that receives them, and the
        app needs no account.
      </p>
      <p>
        If you connect GitHub, the app backs your projects up to private repositories on your
        own GitHub account. They are yours there too, kept by GitHub under its own terms.
        A backup can fall behind or fail, so do not make it the only copy of something that
        matters.
      </p>

      <h2>Agents and their providers</h2>
      <p>
        Enclose works through coding agents that you install and sign in to yourself: Claude
        Code, Codex, Grok or opencode. What you write, the pictures you attach and the files
        the agent reads go to the provider that agent uses, on your own subscription or
        account with it and under its terms. You pay them, not Enclose. Enclose is not
        affiliated with those providers, and they do not endorse it.
      </p>
      <p>
        An agent edits files and runs commands on your machine, with the permissions you give
        it. What it writes can be wrong. Read what it did before you rely on it, and keep a
        copy of work that matters, in git or elsewhere.
      </p>

      <h2>A model is not the thing</h2>
      <p>
        What the app shows is a model. It is no promise that a part fits, holds, or is safe
        to make or to use. Check sizes, tolerances and anything safety depends on yourself
        before you have something made.
      </p>
      <p>
        So is a circuit board. Its drawings, its Gerbers and its STEP file are no promise
        that the board works, meets a board house’s rules, or is safe to power. Check it
        before you order one. What you order from a board house is between you and them.
      </p>

      <h2>Early software</h2>
      <p>
        Enclose is an alpha. It can change without notice, stop working, or lose work. Do not
        make it the only place something important is kept.
      </p>

      <h2>Fair use</h2>
      <p>
        Use the site and the app within the law. Do not use them to harm others, and do not
        attack or overload the site or the services its downloads come from.
      </p>

      <h2>No charge</h2>
      <p>
        The app is free. If anything paid is ever offered, its price and terms will be shown
        before you buy.
      </p>

      <h2>No warranty</h2>
      <p>
        The site and the app are provided as they are, with no warranty of any kind, as far
        as the law allows: none of merchantability, of fitness for a particular purpose, or
        of non-infringement. The license says the same of the code, in its sections 15 and
        16.
      </p>

      <h2>Limits of liability</h2>
      <p>
        As far as the law allows, the maintainer and the project’s contributors are not
        liable for any loss or damage that comes of using the site or the app, or of not
        being able to: lost work, lost data, lost profit, or anything indirect or
        consequential. Where the law does not allow a limit, that limit does not apply.
      </p>

      <h2>What came from others</h2>
      <p>
        Some of what ships with the project is other people’s and stays under their terms.
        The robot arm in the examples, and on this site, is the SO-101 by TheRobotStudio,
        under the Apache License 2.0. Circuit boards are built with tscircuit, under the MIT
        License, which the app downloads when it builds the first one.{' '}
        <a href={`${REPOSITORY}/blob/main/NOTICE.md`}>NOTICE.md</a> has the rest.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may be changed. The newest are always on this page, with the date they
        were last changed at the top.
      </p>

      <h2>Contact</h2>
      <p>
        Questions go to the project’s <a href={`${REPOSITORY}/issues`}>issues on GitHub</a>.
      </p>
    </Legal>
  )
}
