import { Dropdown, NavDropdown } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { NotesState } from "../plugins/remdo/utils/api";
import { useDocumentSelector } from "./DocumentSessionProvider";

export function DocumentMenu() {
  const { setDocumentID } = useDocumentSelector();
  const navigate = useNavigate();

  return (
    <div data-testid="document-selector">
      <NavDropdown title="Documents">
        {NotesState.documents().map((document) => (
          <Dropdown.Item
            href={`?documentID=${document}`}
            key={document}
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
              setDocumentID(document);
            }}
          >
            {document}
          </Dropdown.Item>
        ))}
      </NavDropdown>
    </div>
  );
}
