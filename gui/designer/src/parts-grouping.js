/**
 * Parts lifecycle grouping + naming helpers.
 * Pure functions — no React, no store dependencies.
 */

/**
 * Split parts into 3 lifecycle groups for palette display.
 * Archived parts are excluded from all groups.
 */
export function groupByLifecycle(parts, activeProjectId) {
  const nonArchived = parts.filter(p => p.status !== 'archived');
  return {
    thisProject: nonArchived.filter(p =>
      p.status === 'draft' && p.origin?.projectId === activeProjectId
    ),
    library: nonArchived.filter(p =>
      p.status === 'verified' || !p.status
    ),
    otherProjects: nonArchived.filter(p =>
      p.status === 'draft' && p.origin?.projectId && p.origin.projectId !== activeProjectId
    ),
  };
}

/**
 * Format assembly product name: "{projectName} — {assemblyName}".
 */
export function formatProductName(projectName, assemblyName) {
  return `${projectName} — ${assemblyName}`;
}
