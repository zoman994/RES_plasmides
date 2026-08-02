import { t } from '../i18n';

/**
 * The wording a `LocusSummary` needs, resolved OUTSIDE the UI-only `components/Search` cluster.
 *
 * The component draws a locus; it does not know what the app calls «цепь» or «координаты». Keeping
 * the lookup here is what lets the boundary test stay strict — and it is a function, not a frozen
 * object, because the catalogue is switched at runtime and a module-level constant would freeze the
 * first language the bundle happened to load.
 */
export function LOCUS_LABELS() {
  return {
    strand: t('search.locus.strandLabel'),
    coords: t('search.locus.coordsLabel'),
    coordsTitle: t('search.locus.coordsTitle'),
  };
}
