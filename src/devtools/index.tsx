import { IconPlaywright, IconVitest } from "./icons";
import { Outlet } from "react-router-dom";
const yjsHtmlUrl = new URL("./yjs/yjs.html", import.meta.url);

export function DevTools() {
  if (import.meta.env.PROD) return null;

  return (
    <div>
      <Outlet />
      <h1>Dev Links</h1>
      <ol>
        <li>
          <a href="/data/playwright-report/">
            Playwright Report {IconPlaywright}
          </a>
        </li>
        <li>
          <a href={`http://${location.hostname}:51204/__vitest__/#/`}>
            Vitest {IconVitest}
          </a>
        </li>
        <li>
          <a href="/data/.vitest-preview/">
            Vitest Preview {IconVitest}
          </a>
        </li>
        <li>
          <a href="/data/build/stats.html">
            Bundle stats <i className="bi bi-graph-up" />
          </a>
        </li>
        <li>
          <a href="/_dev/yjs">
            Yjs Component <img
              src="/images/yjs.png"
              style={{ height: "1em", width: "1em" }}
              alt="Yjs"
            />
          </a>
        </li>
        <li>
          <a href={yjsHtmlUrl.pathname}>
            Yjs <img
              src="/images/yjs.png"
              style={{ height: "1em", width: "1em" }}
              alt="Yjs"
            />
          </a>
        </li>
        <li>
          <a href="/demo.html">Demo</a>
        </li>
        <li>
          <a href="/_dev/demo">Demo React</a>
        </li>
        <li>
          <a href="/_dev/lexical">Lexical Demo</a>
        </li>
        <li>
          <a
            href={`http://${location.hostname}:3000/?isCollab=true&collabEndpoint=ws://${location.hostname}:1234`}
          >
            Lexical <img
              src="/images/lexical.ico"
              style={{ height: "1em" }}
              alt="Lexical"
            />
          </a>
        </li>
      </ol>
    </div>
  );
}
