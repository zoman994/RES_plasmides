// Drag MIME for library/tree entries. Extracted into its own tiny module so
// lightweight consumers (the shared LibrarySearchBar picker) can read the
// constant WITHOUT importing use-tree-drop-target — that hook pulls the whole
// CanvasSkeleton store graph (skeleton-context + canvas-layout), whose heavy
// transitive import broke the lazy align-workspace chunk when AlignInputPanel
// reused the picker. Keep this file dependency-free.
export const TREE_DRAG_MIME = 'application/x-bodge-entry-id';
