/**
 * Mutagenesis payload builder.
 *
 * Translates a `computeMutagenesisStrategy` result into the shape expected by
 * the active assembly slot (project-prefixed primer names + protocolSteps
 * matching the chosen strategy). Pure function — no store access.
 */

import { PCR_MIXES } from '../protocol-data';

/**
 * @param {Object} result — output of computeMutagenesisStrategy()
 * @param {Object} ctx
 * @param {string} ctx.primerPrefix — e.g. 'IS'
 * @param {string} ctx.polymerase — key into PCR_MIXES (e.g. 'phusion')
 * @param {Array}  ctx.existingPrimers — current primers in the assembly (non-mutagenesis preserved)
 * @param {string} ctx.templateName — display name used in primer naming
 * @returns {{primers: Array, protocolSteps: Array}}
 */
export function buildMutagenesisPayload(result, ctx) {
  const {
    primerPrefix = '',
    polymerase = 'phusion',
    existingPrimers = [],
    templateName = 'template',
  } = ctx || {};

  const mutLabel = result.mutations?.[0]?.label || 'mut';

  // ── Rename strategy primers with project prefix ──
  let pidx = 1;
  const namedPrimers = (result.primers || []).map((p) => {
    const direction = p.direction || 'forward';
    const suffix = direction === 'forward' ? 'fwd' : 'rev';
    return {
      name: `${primerPrefix}${String(pidx++).padStart(3, '0')}_mut_${suffix}_${templateName}`,
      sequence: p.sequence,
      bindingSequence: p.bindingSequence || p.sequence,
      tailSequence: p.tailSequence || '',
      tailPurpose: p.tailPurpose || '',
      tmBinding: p.tmBinding || 0,
      tmFull: p.tmFull || 0,
      gcPercent: p.gcPercent || 0,
      length: p.length || (p.sequence?.length ?? 0),
      direction,
      isMutagenesis: true,
      mutation: mutLabel,
    };
  });

  // Preserve non-mutagenesis primers from prior state; drop stale mutagenesis ones.
  const preservedPrimers = existingPrimers.filter((p) => !p.isMutagenesis);
  const primers = [...preservedPrimers, ...namedPrimers];

  // ── Build protocolSteps depending on strategy ──
  const templateLen =
    result.fragments?.[0]?.length || result.mutantSequence?.length || 0;
  let protocolSteps = [];

  if (result.strategy === 'kld') {
    const fwd = namedPrimers.find((p) => p.direction === 'forward');
    const rev = namedPrimers.find((p) => p.direction === 'reverse');
    const annealTemp = Math.round(
      Math.min(fwd?.tmBinding || 60, rev?.tmBinding || 60)
    );
    protocolSteps = [
      {
        id: 'kld_pcr',
        type: 'pcr',
        title: `Обратная ПЦР ${templateName}`,
        subtitle: `${templateLen} п.н.`,
        template: templateName,
        fwdPrimer: fwd?.name,
        revPrimer: rev?.name,
        annealTemp,
        expectedSize: templateLen,
        extensionTime: Math.ceil(templateLen / 1000) * 30,
        mix: PCR_MIXES[polymerase],
        statuses: [
          { label: 'ПЦР', done: false },
          { label: 'Гель', done: false },
        ],
      },
      {
        // ProtocolTracker has no 'digestion' branch — fallback to 'assembly' keeps the card rendered.
        id: 'dpni',
        type: 'assembly',
        title: 'DpnI: уничтожить матрицу',
        subtitle: '1 ч при 37°C',
        statuses: [{ label: 'DpnI', done: false }],
      },
      {
        id: 'kld_asm',
        type: 'kld',
        title: 'KLD реакция',
        subtitle: '25°C 30 мин (T4 PNK + T4 лигаза + DpnI)',
        statuses: [{ label: 'KLD', done: false }],
      },
      {
        id: 'transform',
        type: 'transform',
        title: 'Трансформация',
        statuses: [
          { label: 'Трансф.', done: false },
          { label: 'Колонии', done: false },
        ],
      },
      {
        id: 'screening',
        type: 'screening',
        title: 'Colony PCR',
        expectedSize: templateLen,
        statuses: [{ label: 'Colony PCR', done: false }],
      },
      {
        id: 'sequencing',
        type: 'sequencing',
        title: 'Секвенирование',
        statuses: [
          { label: 'Отправлено', done: false },
          { label: 'Подтв.', done: false },
        ],
      },
    ];
  } else if (
    result.strategy === 'two_fragment' ||
    result.strategy === 'multi_fragment'
  ) {
    const n = result.fragments?.length || 2;
    protocolSteps = [
      {
        id: 'pcr_parts',
        type: 'pcr',
        title: `ПЦР ${n} фрагментов от WT-матрицы`,
        subtitle: `${n} отдельные реакции`,
        template: templateName,
        mix: PCR_MIXES[polymerase],
        statuses: [
          { label: 'ПЦР', done: false },
          { label: 'Гель', done: false },
          { label: 'Очистка', done: false },
        ],
      },
      {
        id: 'overlap_pcr',
        type: 'assembly',
        title: 'Overlap PCR (сшивка через мутантные overlap-зоны)',
        statuses: [{ label: 'Сшивка', done: false }],
      },
      {
        id: 'transform',
        type: 'transform',
        title: 'Трансформация',
        statuses: [
          { label: 'Трансф.', done: false },
          { label: 'Колонии', done: false },
        ],
      },
      {
        id: 'screening',
        type: 'screening',
        title: 'Colony PCR',
        statuses: [{ label: 'Colony PCR', done: false }],
      },
      {
        id: 'sequencing',
        type: 'sequencing',
        title: 'Секвенирование',
        statuses: [
          { label: 'Отправлено', done: false },
          { label: 'Подтв.', done: false },
        ],
      },
    ];
  }

  return { primers, protocolSteps };
}
