import { config } from '#config';

const REPOSITORY_URL = 'https://github.com/remdo-project/remdo';
const COPYRIGHT_YEAR = new Date().getFullYear();

function CommitLink({ revision }: { revision: string }) {
  return (
    <a href={`${REPOSITORY_URL}/commit/${revision}`} target="_blank" rel="noreferrer" title={revision}>
      #{revision.slice(0, 8)}
    </a>
  );
}

export default function AppFooter({ serverRevision }: { serverRevision: string }) {
  const revision = config.browser.BUILD_REVISION;
  const mismatch = !config.dev && revision && serverRevision && revision !== serverRevision;
  return (
    <footer className="remdo-footer">
      <div className="remdo-footer-start">
        <span>© {COPYRIGHT_YEAR} RemDo</span>
        <nav aria-label="Footer" className="remdo-footer-links">
          <a href="/privacy/">Privacy</a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Source</a>
        </nav>
      </div>
      {mismatch ? (
        <span className="remdo-footer-mismatch" role="status">
          <strong>App and server builds differ</strong>
          {' · App '}<CommitLink revision={revision} />
          {' · Server '}<CommitLink revision={serverRevision} />
        </span>
      ) : config.dev ? <span>Local development</span> : revision ? (
        <span className="remdo-footer-build">Build <CommitLink revision={revision} /></span>
      ) : <span>Build unknown</span>}
    </footer>
  );
}
