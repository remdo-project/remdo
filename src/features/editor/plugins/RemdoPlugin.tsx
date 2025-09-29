// @ts-nocheck
// TODO(remdo): Type the RemdoPlugin composition once each child plugin exposes a typed interface.
import "./RemdoPlugin.scss";
import { BackspacePlugin } from "./remdo/BackspacePlugin";
import { BreadcrumbPlugin } from "./remdo/BreadcrumbsPlugin";
import { CheckPlugin } from "./remdo/CheckPlugin";
import { RootSchemaPlugin } from "./remdo/RootSchemaPlugin";
import { FocusPlugin } from "./remdo/FocusPlugin";
import { FoldPlugin } from "./remdo/FoldPlugin";
import { IndentationPlugin } from "./remdo/IndentationPlugin";
import { InsertParagraphPlugin } from "./remdo/InsertParagraphPlugin";
import { ListItemNode } from "@lexical/list";
import { ListNode } from "@lexical/list";
import { NoteControlsPlugin } from "./remdo/NoteControlsPlugin";
import { QuickMenuPlugin } from "./remdo/QuickMenuPlugin";
import { RemdoAutoLinkPlugin } from "./remdo/RemdoAutoLinkPlugin";
import { ReorderPlugin } from "./remdo/ReorderPlugin";
import { SearchPlugin } from "./remdo/SearchPlugin";
import { TextNode } from "lexical";
import { applyNodePatches } from "./remdo/utils/patches";
import { YjsPlugin } from "./remdo/YjsPlugin";
import { NoteMetadataPlugin } from "./remdo/NoteMetadataPlugin";
import { useDisableCollaboration } from "../config";

applyNodePatches(ListItemNode);
applyNodePatches(ListNode);
applyNodePatches(TextNode);

export function RemdoPlugin({ anchorRef, documentID }:
  { anchorRef: React.RefObject<HTMLElement | null>; documentID: string }) {
  const disableCollaboration = useDisableCollaboration();

  return (
    //FIXME always enable RootSchemaPlugin and make it wait for collab to be ready
    <>
      <BackspacePlugin />
      <BreadcrumbPlugin documentID={documentID} />
      <CheckPlugin />
      {disableCollaboration && <RootSchemaPlugin />}
      <FocusPlugin anchorRef={anchorRef} />
      <FoldPlugin />
      <IndentationPlugin />
      <InsertParagraphPlugin />
      <NoteControlsPlugin anchorRef={anchorRef} />
      <QuickMenuPlugin />
      <RemdoAutoLinkPlugin />
      <ReorderPlugin />
      <SearchPlugin />
      <NoteMetadataPlugin />
      <YjsPlugin />
    </>
  );
}
