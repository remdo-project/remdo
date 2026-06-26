// TEMPORARY shim — deleted once all consumers import from the new homes.
// The zoom-root store moved to features/zoom/zoom-root.ts; the generic boundary
// check moved to ./tree (isWithinBoundary). These aliases keep existing consumers
// compiling while they are repointed.
import type { ListItemNode } from '@lexical/list';
import { $resolveZoomRoot, getZoomRoot, setZoomRoot } from '#client/editor/features/zoom/zoom-root';
import { isWithinBoundary } from './tree';

export const setZoomBoundary = setZoomRoot;
export const getZoomBoundary = getZoomRoot;
export const $resolveZoomBoundaryRoot = $resolveZoomRoot;

export function isWithinZoomBoundary(item: ListItemNode, boundaryRoot: ListItemNode | null): boolean {
  return isWithinBoundary(item, boundaryRoot);
}
