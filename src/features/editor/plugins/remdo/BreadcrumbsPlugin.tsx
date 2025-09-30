import { useRemdoLexicalComposerContext } from "./ComposerContext";
import { Note } from "./utils/api";
import { useCallback, useEffect, useState } from "react";
import Breadcrumb from "react-bootstrap/Breadcrumb";
import { Link, useParams } from "react-router-dom";
import { DocumentMenu } from "@/features/editor/DocumentSelector/DocumentMenu";
import { YJS_SYNCED_COMMAND } from "./utils/commands";
import { COMMAND_PRIORITY_LOW } from "lexical";

type Crumb = {
  text: string;
  id: string;
};

export function BreadcrumbPlugin({ documentID }: { documentID: string }) {
  const [editor] = useRemdoLexicalComposerContext();
  const locationParams = useParams();

  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([]);
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

      const nextCrumbs = [note, ...note.parents]
        .slice(0, -1) //skip root
        .reverse()
        .map((crumb) => ({
          text: crumb.text,
          id: crumb.id,
        }));

      // TODO: Replace this state bridge with a command subscription so we can
      // drop the imperative setState call inside useEffect.
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setBreadcrumbs((previous) => {
        if (
          previous.length === nextCrumbs.length &&
          previous.every(
            (crumb, index) =>
              crumb.id === nextCrumbs[index]?.id &&
              crumb.text === nextCrumbs[index]?.text
          )
        ) {
          return previous;
        }

        return nextCrumbs;
      });
    });
  }, [editor, noteID]);

  useEffect(() => {
    updateBreadcrumbs();
  }, [locationParams, updateBreadcrumbs]);

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
          <DocumentMenu />
        </Breadcrumb.Item>
        <Breadcrumb.Item linkAs={Link} linkProps={{ to: "/" }}>
          {documentID}
        </Breadcrumb.Item>
        {breadcrumbItems}
      </Breadcrumb>
    </div>
  );
}
