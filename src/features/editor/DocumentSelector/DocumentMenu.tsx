import { Dropdown, NavDropdown } from "react-bootstrap";
import { NotesState } from "../plugins/remdo/utils/api";
import { useDocumentSelector } from "./DocumentSessionProvider";

export function DocumentMenu() {
  const { id, setId } = useDocumentSelector();

  return (
    <div data-testid="document-selector">
      <NavDropdown title="Documents">
        {NotesState.documents().map((document) => (
          <Dropdown.Item
            key={document}
            active={document === id}
            onClick={() => {
              setId(document);
            }}
          >
            {document}
          </Dropdown.Item>
        ))}
      </NavDropdown>
    </div>
  );
}
