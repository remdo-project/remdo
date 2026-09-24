import { config } from '#config';

const REPOSITORY_URL = 'https://github.com/remdo-project/remdo';

function CommitLink({ revision }: { revision: string }) {
  return (
    <a href={`${REPOSITORY_URL}/commit/${revision}`} target="_blank" rel="noreferrer" title={revision}>
      #{revision.slice(0, 8)}
    </a>
  );
}

export default function BuildStatus({ serverRevision }: { serverRevision: string }) {
  const revision = config.browser.BUILD_REVISION;
  const mismatch = !config.dev && revision && serverRevision && revision !== serverRevision;
  if (mismatch) {
    return (
      <span className="remdo-footer-mismatch" role="status">
        <strong>App and server builds differ</strong>
        {' · App '}<CommitLink revision={revision} />
        {' · Server '}<CommitLink revision={serverRevision} />
      </span>
    );
  }
  if (config.dev) return <span>Local development</span>;
  return revision
    ? <span className="remdo-footer-build">Build <CommitLink revision={revision} /></span>
    : <span>Build unknown</span>;
}
