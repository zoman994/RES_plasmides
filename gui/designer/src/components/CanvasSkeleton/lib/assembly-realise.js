/**
 * assembly-realise — T6 K6 back-compat alias (DEC-T6-04). The A4
 * reverse-DAG realise algorithm moved to `zone-pieces-to-dag.js`
 * (now reads 4-tier pieces from a zone; still resolves legacy
 * assemblyDrafts ids through the transition window). This module
 * stays as a thin re-export so existing import sites keep working;
 * scheduled for removal in a future cleanup sprint.
 */
export { realiseAssembly, nameWithRevision } from './zone-pieces-to-dag';
