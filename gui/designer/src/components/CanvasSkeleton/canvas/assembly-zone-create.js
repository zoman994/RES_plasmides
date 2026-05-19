/**
 * assembly-zone-create — single source of the "create an assembly"
 * action (Игорь 18.05.2026: «два типа сборок … давай унифицируем»,
 * decision «Только зона»).
 *
 * Post-T6 an assembly IS a zone (ANCHORS DEC-CANVAS-4T-07: "Zone
 * supersedes assemblyDraft"; migration v7→v8 converts every legacy
 * draft → a zone). Both entry points — the bottom-right «+ Сборка»
 * button (CanvasSkeleton/index.jsx) and «+ Новая сборка» inside the
 * AssemblyDraftsPanel — now build their CREATE_ZONE action HERE, so
 * there is exactly one entity, one renderer (zone frame + lanes), one
 * counter. The legacy CREATE_ASSEMBLY_DRAFT path is left UI-unreachable
 * (reducer kept no-op for ~50 legacy tests — DEC-T6-14).
 *
 * Pure: takes the skeleton state, returns a CREATE_ZONE action with an
 * auto-name «Сборка N» and a cascaded bounds rect (N = existing zone
 * count + 1). Verbatim of the cascade AssemblyDraftsPanel used before
 * — zero behaviour change for that panel.
 */
import { v7 as uuidv7 } from 'uuid';
import { selectAllZones } from '../store/selectors-zones';

/**
 * Build the CREATE_ZONE action with a CALLER-SIDE id (Игорь 19.05.2026
 * — regression «потерялось окно сборки»): the reducer-generated zone id
 * is undiscoverable, so «+ Сборка» could create a zone but never open
 * its colored-segment assembly editor. Pre-generating `zone.id` here
 * (createZone honours it) lets the caller chain
 * `openEditorAssemblyTab(action.zone.id)` → user lands straight in the
 * build window. Same `zn-` convention as createZone — indistinguishable
 * from a reducer-generated id.
 */
export function buildAssemblyZoneAction(state) {
  const n = selectAllZones(state).length + 1;
  return {
    type: 'CREATE_ZONE',
    zone: {
      id: `zn-${uuidv7()}`,
      name: `Сборка ${n}`,
      bounds: {
        x: 40 + (n - 1) * 40,
        y: 40 + (n - 1) * 40,
        width: 600,
        height: 400,
      },
    },
  };
}
