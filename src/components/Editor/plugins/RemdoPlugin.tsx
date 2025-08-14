import "./RemdoPlugin.scss";
import { BackspacePlugin } from "./remdo/BackspacePlugin";
import { BreadcrumbPlugin } from "./remdo/BreadcrumbsPlugin";
import { CheckPlugin } from "./remdo/CheckPlugin";
import { FixRootPlugin } from "./remdo/FixRootPlugin";
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

applyNodePatches(ListItemNode);
applyNodePatches(ListNode);
applyNodePatches(TextNode);

export function RemdoPlugin({ anchorRef, documentID }:
  { anchorRef: React.RefObject<HTMLElement>; documentID: string }) {

  return (
    <>
      <BackspacePlugin />
      <BreadcrumbPlugin documentID={documentID} />
      <CheckPlugin />
      <FixRootPlugin />
      <FocusPlugin anchorRef={anchorRef} />
      <FoldPlugin />
      <IndentationPlugin />
      <InsertParagraphPlugin />
      <NoteControlsPlugin anchorRef={anchorRef} />
      <QuickMenuPlugin />
      <RemdoAutoLinkPlugin />
      <ReorderPlugin />
      <SearchPlugin />
      <YjsPlugin />
    </>
  );
}
