import { NotesState, Note } from "@/components/Editor/plugins/remdo/utils/api";
import { patch } from "@/utils";

export function applyNodePatches(NodeType: any) {
  patch(NodeType, "updateDOM", function (oldMethod, prevNode, dom, config) {
    //lexicalMethod has to be placed first as it may have some side effects
    return (
      //TODO perform an actual check
      oldMethod(prevNode, dom, config) || true
    );
  });
}
