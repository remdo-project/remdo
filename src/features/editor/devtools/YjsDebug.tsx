import { useDocumentSelector } from "../DocumentSelector/DocumentSessionProvider";
import { useSearchParams } from "react-router-dom";

export function YjsDebug() {
  const session = useDocumentSelector();
  const [searchParams] = useSearchParams();

  return (
    <div>
      <div>Params: <pre>{JSON.stringify(Object.fromEntries(searchParams), null, 2)}</pre></div>
      <div>Yjs documentID: {session.id}</div>
      <br />
    </div>
  );
}
