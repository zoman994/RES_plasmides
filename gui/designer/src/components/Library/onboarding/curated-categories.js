/**
 * Curated subset of demo categories surfaced in the onboarding picker
 * (M-X.5 K5, biolog approved 7-category curation).
 *
 * Source: `public/plasmids-index.json` ships 19 SnapGene-derived
 * categories (2822 plasmids total). The full list includes esoteric
 * collections (lucigen, qiagen, structural genomics, image consortium,
 * gateway, insect, luciferase, coronavirus, ta_gc, topo, pgex, viral)
 * that are noise for a Russian molecular biologist's onboarding flow.
 *
 * The 7 entries below cover the most relevant working contexts:
 *   - Basic Cloning Vectors (pUC19, pBR322, pET28b, …)
 *   - pET / Duet (E. coli expression — biolog's primary system)
 *   - Mammalian Expression (CHO, HEK293, transient transfection)
 *   - Yeast Plasmids (Pichia, Saccharomyces — fungal expertise)
 *   - CRISPR Plasmids (Cas9 / Cas12a editing)
 *   - Plant Vectors (Agrobacterium-mediated transformation)
 *   - Fluorescent Proteins (GFP, RFP, reporters)
 *
 * Slugs match `plasmids-index.json` exactly so K5 can fetch
 * `/plasmids-data/${slug}.json` without translation.
 *
 * The full 19 categories remain accessible through a future
 * «Browse all demo» mode (out of M-X.5 scope) — slugs of the
 * other 12 stay valid in localStorage / origin.categorySlug.
 */
export const CURATED_CATEGORIES = [
  {
    slug: 'basic_cloning_vectors',
    label: 'Базовые векторы клонирования',
    count: 308,
    blurb: 'pUC19, pBR322, pET28b — стандартные backbone для общего клонирования.',
  },
  {
    slug: 'pet_and_duet_vectors_(novagen)',
    label: 'pET / Duet (экспрессия в E. coli)',
    count: 120,
    blurb: 'T7-промотерные векторы Novagen для индуцируемой экспрессии в E. coli.',
  },
  {
    slug: 'mammalian_expression_vectors',
    label: 'Млекопитающие — экспрессия',
    count: 349,
    blurb: 'CMV / EF-1α / SV40 промотеры для экспрессии в CHO / HEK293.',
  },
  {
    slug: 'yeast_plasmids',
    label: 'Дрожжи — экспрессия и shuttle',
    count: 192,
    blurb: 'Pichia, Saccharomyces, shuttle-векторы.',
  },
  {
    slug: 'crispr_plasmids',
    label: 'CRISPR / Cas системы',
    count: 286,
    blurb: 'Cas9 / Cas12a / Cas13 векторы и вспомогательные конструкции.',
  },
  {
    slug: 'plant_vectors',
    label: 'Растения — Agrobacterium',
    count: 95,
    blurb: 'Бинарные векторы для Agrobacterium-mediated трансформации.',
  },
  {
    slug: 'fluorescent_protein_genes_and_plasmids',
    label: 'Флуоресцентные белки и репортёры',
    count: 398,
    blurb: 'GFP / RFP / mCherry / BFP / YFP — репортёрные слияния и одиночные ORF.',
  },
];
