import { Legal } from '../../components/Legal'
import { REPOSITORY } from '../../shell/Header'

export default function Contact() {
  return (
    <Legal page="contact" title="Contact">
      <p>
        Enclose is an open-source project maintained by Glauber, and it is talked about where
        its code is: on GitHub, in the open, where an answer helps the next person who asks
        the same thing.
      </p>

      <h2>Questions, problems and ideas</h2>
      <p>
        Open an <a href={`${REPOSITORY}/issues`}>issue on GitHub</a>. For a problem, say what
        you did, what you expected and what happened, with your system and the app’s version
        (Settings shows it). A model that shows the problem helps more than anything, if it is
        one you can share. For an idea, say what you would change and why, with a picture if
        it is something seen.
      </p>

      <h2>Changes to the code</h2>
      <p>
        A small fix needs no asking: open a{' '}
        <a href={`${REPOSITORY}/pulls`}>pull request</a>. Anything bigger starts as an issue,
        so that it is talked over before it is built.{' '}
        <a href={`${REPOSITORY}/blob/main/CONTRIBUTING.md`}>CONTRIBUTING.md</a> says how.
      </p>

      <h2>Your data</h2>
      <p>
        The <a href="/privacy">privacy policy</a> says what the app and this website send
        anywhere, and how to ask to see, correct or delete what the project holds about you.
      </p>

      <h2>The maintainer</h2>
      <p>
        Glauber, who makes Enclose, is at <a href="https://glauber.org">glauber.org</a>.
      </p>
    </Legal>
  )
}
