import { config } from '#config';

function CommitLink({ revision }: { revision: string }) {
  return (
    <a href={`https://github.com/remdo-project/remdo/commit/${revision}`} target="_blank" rel="noreferrer" title={revision}>
      #{revision.slice(0, 8)}
    </a>
  );
}

export default function AppFooter({ serverRevision }: { serverRevision: string }) {
  const revision = config.browser.BUILD_REVISION;
  const mismatch = !config.dev && revision && serverRevision && revision !== serverRevision;
  return (
    <footer className="remdo-footer">
      <div className="remdo-footer-links">
        <a href="https://github.com/remdo-project/remdo" target="_blank" rel="noreferrer">Source</a>
        {mismatch ? (
          <span className="remdo-footer-mismatch" role="status">
            <strong>App and server builds differ</strong>
            {' · App '}<CommitLink revision={revision} />
            {' · Server '}<CommitLink revision={serverRevision} />
          </span>
        ) : config.dev ? <span>Local development</span> : revision ? (
          <span>Build <CommitLink revision={revision} /></span>
        ) : <span>Build unknown</span>}
      </div>
    </footer>
  );
}
