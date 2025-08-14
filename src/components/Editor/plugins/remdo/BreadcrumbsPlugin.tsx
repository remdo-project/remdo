import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { Note } from "./utils/api";
import { useCallback, useEffect, useState } from "react";
import Breadcrumb from "react-bootstrap/Breadcrumb";
import { Link, useParams } from "react-router-dom";
import { DocumentSelector } from "@/components/Editor/DocumentSelector/DocumentSelector";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { COMMAND_PRIORITY_LOW } from "lexical";

type Breadcrumb = {
  text: string;
  id: string;
};

export function BreadcrumbPlugin({ documentID }: { documentID: string }) {
  const [editor] = useRemdoLexicalComposerContext();
  const locationParams = useParams();

  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const { noteID } = useParams();

  const updateBreadcrumbs = useCallback(() => {
    editor.read(() => {
      let note: Note;
      try {
        note = Note.fromID(noteID || "root");
      }
      catch {
        note = Note.fromID("root");
      }

      setBreadcrumbs(
        [note, ...note.parents]
          .slice(0, -1) //skip root
          .reverse()
          .map((note) => ({
            text: note.text,
            id: note.id,
          }))
      );
    });
  }, [editor, noteID]);

  useEffect(() =>
    updateBreadcrumbs(), [editor, locationParams, updateBreadcrumbs]);

  useEffect(() =>
    editor.registerCommand(
      YJS_SYNCED_COMMAND,
      () => {
        updateBreadcrumbs();
        return false;
      },
      COMMAND_PRIORITY_LOW
    ), [editor, updateBreadcrumbs]);

  const breadcrumbItems = breadcrumbs.map(
    ({ text, id }, index, { length }) => (
      <Breadcrumb.Item
        key={id}
        active={index === length - 1}
        linkAs={Link}
        linkProps={{ to: `/note/${id}` }}
      >
        {text}
      </Breadcrumb.Item>
    )
  );

  return (
    <div>
      <Breadcrumb id="notes-path">
        <Breadcrumb.Item linkAs="div">
          <DocumentSelector />
        </Breadcrumb.Item>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: "/" }}>
          {documentID}
        </Breadcrumb.Item>
        {breadcrumbItems}
      </Breadcrumb>
    </div>
  );
}
