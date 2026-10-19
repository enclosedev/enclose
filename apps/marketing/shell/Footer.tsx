import { REPOSITORY } from './Header'

/** The foot of a page: whose it is, what it is under, and where the rest is. */
export function Footer() {
  return (
    <footer className="footer">
      <p>
        ©2026 Enclose is an open-source project maintained by{' '}
        <a href="https://glauber.org" data-native>
          Glauber
        </a>
        .{' '}
        <a href={`${REPOSITORY}/blob/main/LICENSE`} data-native>
          AGPL-3.0
        </a>
      </p>
      <ul className="footer__links">
        <li>
          <a href={REPOSITORY} data-native>
            Github
          </a>
        </li>
        <li>
          <a href="/about">About</a>
        </li>
        <li>
          <a href="/contact">Contact</a>
        </li>
        <li>
          <a href="/terms">Terms</a>
        </li>
        <li>
          <a href="/privacy">Privacy</a>
        </li>
      </ul>
    </footer>
  )
}
