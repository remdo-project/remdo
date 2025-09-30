import { Dropdown, NavDropdown } from "react-bootstrap";
import { NotesState } from "../plugins/remdo/utils/api";
import { useDocumentSelector } from "./DocumentSessionProvider";

export function DocumentMenu() {
  const { documentID, selectDocument } = useDocumentSelector();

  return (
    <div data-testid="document-selector">
      <NavDropdown title="Documents">
        {NotesState.documents().map((document) => (
          <Dropdown.Item
            key={document}
            active={document === documentID}
            onClick={() => {
              selectDocument(document);
            }}
          >
            {document}
          </Dropdown.Item>
        ))}
      </NavDropdown>
    </div>
  );
}
