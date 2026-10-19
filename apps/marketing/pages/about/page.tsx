import { Legal } from '../../components/Legal'
import { REPOSITORY } from '../../shell/Header'

export default function About() {
  return (
    <Legal page="about" title="About">
      <p>
        Enclose is an open-source desktop workbench for CAD projects that are built from code.
        You look at the model in 3D, click the part you mean, say what should change, and the
        coding agent on your machine (Claude Code, Codex, Grok or opencode) edits the project
        and rebuilds it.
      </p>

      <h2>What it is for</h2>
      <p>
        Designing physical things by saying what they should be: an enclosure for a circuit
        board, a bracket, a box with a lid, a robot arm. The model is a Python program, written
        with <a href="https://build123d.readthedocs.io">build123d</a>, and the agent writes and
        changes it for you. Enclose opens STEP, STL and OBJ files to start from, saves parts in
        those same formats, and draws the model flat as vector blueprints. The circuit boards
        that go in a model are designed with <a href="https://tscircuit.com">tscircuit</a>.
      </p>

      <h2>How it works</h2>
      <p>
        Enclose has no account and no server of its own. It works through an agent you
        installed and signed in to yourself, on your own subscription with its provider. A
        project is a folder on your machine, with its history kept in git, and backed up to
        your own GitHub account if you connect it. The{' '}
        <a href="/privacy">privacy policy</a> says what the app sends anywhere.
      </p>

      <h2>Who makes it</h2>
      <p>
        Enclose is maintained by <a href="https://glauber.org">Glauber</a>, and is mostly one
        person’s work, open to anyone’s contributions. Its code is on{' '}
        <a href={REPOSITORY}>GitHub</a> under the GNU Affero General Public License, version 3:
        free to use, change and pass on. It is early days: the app is for macOS 13 or newer and
        for Linux.
      </p>

      <h2>Where to go next</h2>
      <p>
        The <a href={`${REPOSITORY}/blob/main/docs/README.md`}>documentation</a> says how to
        install it and how it works, the{' '}
        <a href={`${REPOSITORY}/releases/latest`}>newest release</a> is on GitHub, and the{' '}
        <a href="/contact">contact page</a> says where to ask a question.
      </p>
    </Legal>
  )
}
