import { Legal } from '../../components/Legal'
import { REPOSITORY } from '../../shell/Header'

export default function Privacy() {
  return (
    <Legal page="privacy" title="Privacy Policy" updated="15 October 2026">
      <p>
        Enclose is an open-source project maintained by Glauber. This page says what the
        Enclose app and this website send anywhere, and what they do not. In short: the app
        needs no account, your projects stay on your machine unless you connect GitHub to
        back them up, and the installed app counts how it is used, without your name,
        unless you switch that off. This website counts its visits, without cookies and
        without knowing whose they are.
      </p>

      <h2>Usage data from the app</h2>
      <p>
        The installed app counts how it is used, so that what is worked on next is what
        people use, and sends that count to <a href="https://posthog.com">PostHog</a>. Run
        from a checkout of the source, it sends nothing.
      </p>
      <p>What is counted, each as an event with a few words and numbers:</p>
      <ul>
        <li>that the app was opened;</li>
        <li>
          that a project was added or removed, and whether it was new, an example, CAD files
          or a folder;
        </li>
        <li>
          that a message was sent: the agent, its model, the effort and the permissions, how
          many parts and pictures went with it, and whether a circuit board was on screen;
        </li>
        <li>
          that a model was looked over, a new version of a project begun, a change turned
          back, or a model or a circuit board saved;
        </li>
        <li>
          that an assembly guide was asked for, written, opened, saved or removed, and how
          many steps it has;
        </li>
        <li>
          which features the view was put into (a section, the exploded view, the blueprint,
          the assembly guides, a reference scene, a project’s own tools, a circuit board),
          once for a run of the app;
        </li>
        <li>
          that an agent was switched on or off or updated, that an update was fetched, and
          that GitHub was connected or disconnected, without which account.
        </li>
      </ul>
      <p>
        With every event go the app’s version, your operating system’s name and version, the
        kind of processor, and a random name made up for your installation the first time the
        app runs. That name is tied to no account and to nothing else about you. PostHog keeps
        what it is sent in the United States. As any server does, it sees the address a request comes
        from, and works out roughly where that is: a country and a city.
      </p>
      <p>
        Nothing of a project is sent: not its name, its files, or where it is kept. Nothing
        said in a message or in an answer to one. Nothing of what a part, a group or a
        conversation is called.{' '}
        <a href={`${REPOSITORY}/blob/main/docs/usage-data.md`}>The full list</a> is with the
        app’s documentation.
      </p>
      <p>
        To switch it off: Settings, General, Usage data. Switched off, nothing more is
        counted, and what was waiting to be sent is not sent. The name made up for your
        installation is in <code>analytics-id</code>, in{' '}
        <code>~/Library/Application Support/Enclose</code>. Delete it and the app makes up
        another the next time it has something to send.
      </p>

      <h2>What goes to an agent’s provider</h2>
      <p>
        The app works through a coding agent you installed and signed in to yourself: Claude
        Code, Codex, Grok or opencode. What you write, the pictures you attach and the project
        files the agent reads go to the provider that agent uses (for opencode, the model
        provider you set it up with), as they would if you ran the agent in a terminal. That
        is between you and that provider, under its privacy policy and your own subscription
        or account with it. None of it goes to the Enclose project.
      </p>
      <p>
        Where Claude Code is installed, the app also asks its quickest model to do a few
        small things, whichever agent a conversation is with: to sum up a long message in
        the few words its card has room for, to name a group of parts you put together, and
        to write what each turn changed in the project’s history. For that it sends the
        message, what the parts and groups are called, or what was asked, what was said back
        and which files changed. That goes to Anthropic, on your Claude Code subscription,
        as the rest of what Claude Code sends does.
      </p>

      <h2>What the app fetches from GitHub</h2>
      <p>
        The app looks for its newer versions on GitHub and downloads them from there, and
        downloads an example project from there when you ask for one. GitHub sees those
        requests and the address they come from, under{' '}
        <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
          its own privacy statement
        </a>
        .
      </p>

      <h2>Python</h2>
      <p>
        Models are built with Python and build123d. Where your Mac has no Python with
        build123d, the app makes one of its own, once: it downloads{' '}
        <a href="https://docs.astral.sh/uv/">uv</a> from GitHub, which downloads Python from
        GitHub and build123d and what it needs from{' '}
        <a href="https://pypi.org">the Python Package Index</a>. Those see what is asked for
        and the address it comes from, and nothing of your projects.
      </p>

      <h2>Backing projects up to GitHub</h2>
      <p>
        Only if you connect it, in Settings, Connections. You sign in on GitHub’s own site
        with a code the app shows you, and install Enclose’s GitHub app on your account.
        GitHub asks you there which of your repositories it may reach: all of them, or only
        the ones you pick. In those, it is let make repositories, push to them, and manage
        them, which GitHub counts as renaming and deleting them too. The app makes and
        renames its own; it deletes none.
      </p>
      <p>
        Once you have connected, each project the app keeps a history of goes to a private
        repository of its own on your account, called <code>enclose-</code> and the
        project’s name, and is pushed to after every change: its files, every version of
        it, and the history’s messages, which say in a few words what was asked and what
        changed. Your conversations themselves are not pushed. What signs the app in to
        GitHub is kept on your machine, sealed with the system’s keychain. Disconnecting
        forgets it, and leaves the repositories on GitHub, yours to keep or delete. GitHub
        keeps them under{' '}
        <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
          its own privacy statement
        </a>
        .
      </p>

      <h2>Circuit boards</h2>
      <p>
        Boards are built with <a href="https://tscircuit.com">tscircuit</a>’s command line,
        which the app downloads from npm the first time it builds one. A board is laid out
        and routed on your machine. While it is built, tscircuit downloads the footprints
        and 3D models of the parts on it, from its own servers and from those of the parts’
        makers and EasyEDA, and an agent looking for a part may ask tscircuit’s search of
        JLCPCB’s stock. Those see what is asked for and the address it comes from, not the
        board. tscircuit’s own usage counting is switched off when the app builds with it.
      </p>

      <h2>What stays on your machine</h2>
      <p>
        Your conversations and your settings are kept on your machine and nowhere else, and
        so are your projects, unless you back them up to GitHub. Removing a project from the
        app forgets what was said about it, and leaves its folder, and its repository on
        GitHub where there is one.
      </p>

      <h2>This website</h2>
      <p>
        This site sets no cookies and shows no advertising. Its fonts and its pictures are
        served from the site itself. The host that serves it keeps the ordinary logs a web
        server keeps: the address a request came from, the browser, the page asked for, and
        when.
      </p>
      <p>
        It counts its visits with{' '}
        <a href="https://www.simpleanalytics.com">Simple Analytics</a>, which is made to
        count without knowing who is visiting. It sets no cookie, puts nothing on your
        device, and keeps no IP address, so there is nothing to tell one visitor from
        another by.
      </p>
      <p>What it keeps of a visit:</p>
      <ul>
        <li>the page looked at, and the page that linked to it;</li>
        <li>the kind of browser, system and device, and the size of the screen and window;</li>
        <li>the browser’s language, and a country worked out from its time zone;</li>
        <li>how long the page was open, and how far down it was scrolled.</li>
      </ul>
      <p>
        Simple Analytics keeps that on servers in the Netherlands, and{' '}
        <a href="https://docs.simpleanalytics.com/what-we-collect">says more of it</a>{' '}
        itself. A visit is counted whether or not your browser asks not to be tracked,
        because nothing that is kept says who you are. A content blocker stops it.
      </p>
      <p>
        To point its download button at the newest release, the page asks GitHub which one
        that is, from your browser, and the download itself comes from GitHub. It asks
        GitHub the same way how many stars the project has. GitHub sees those requests as
        it sees the app’s.
      </p>

      <h2>What is not done</h2>
      <p>
        Nothing is sold, nothing is shared for advertising, and nothing you make or say is
        used to train a model by this project. What an agent’s provider does with what you
        send it is in that provider’s own policy.
      </p>

      <h2>Your choices</h2>
      <p>
        The project cannot tell which events came from you: it has no name or account to
        find them by. You can stop them at any time with the switch above, and deleting{' '}
        <code>analytics-id</code> cuts what is sent afterwards off from what was sent before.
        Depending on where you live you may have rights over personal data held about you,
        to see it, correct it or have it deleted. Ask through the contact below.
      </p>

      <h2>Children</h2>
      <p>
        Neither the site nor the app is meant for children under 13, and nothing is
        knowingly collected from them.
      </p>

      <h2>Changes</h2>
      <p>
        This page may be changed as the app does. The newest is always here, with the date
        it was last changed at the top.
      </p>

      <h2>Contact</h2>
      <p>
        Questions go to the project’s <a href={`${REPOSITORY}/issues`}>issues on GitHub</a>.
        If yours should not be written in public, say only that there and the maintainer
        will find another way to hear it.
      </p>
    </Legal>
  )
}
