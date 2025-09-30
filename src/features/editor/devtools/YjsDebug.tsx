import { useDocumentSelector } from "../DocumentSelector/DocumentSessionProvider";
import { useSearchParams } from "react-router-dom";

export function YjsDebug() {
  const documentSelector = useDocumentSelector();
  const [searchParams] = useSearchParams();

  return (
    <div>
      <div>Params: <pre>{JSON.stringify(Object.fromEntries(searchParams), null, 2)}</pre></div>
      <div>Yjs documentID: {documentSelector.documentID}</div>
      <br />
    </div>
  );
}
