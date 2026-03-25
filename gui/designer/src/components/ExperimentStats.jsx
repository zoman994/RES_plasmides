import { useMemo } from 'react';

function fmtDur(min) {
  if (!min || min <= 0) return '—';
  if (min < 60) return `${Math.round(min)} мин`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Experiment statistics panel.
 * Props:
 *   assemblies — full assemblies array
 *   getStepStates(assemblyId) — function returning step states from localStorage
 */
export default function ExperimentStats({ assemblies }) {
  const stats = useMemo(() => {
    let totalPrimers = 0, reusedPrimers = 0, pcrReactions = 0, gelRuns = 0;
    let purifications = 0, colonyPCR = 0, seqReactions = 0;
    let totalActiveMin = 0;
    const asmStats = [];

    assemblies.forEach(asm => {
      totalPrimers += (asm.primers || []).length;
      reusedPrimers += (asm.primers || []).filter(p => p.reused).length;

      // Load step states from localStorage
      let stepStates = {};
      try {
        stepStates = JSON.parse(localStorage.getItem(`pvcs-protocol-state-${asm.id}`) || '{}');
      } catch {}

      // Count resources from step types
      let asmActiveMin = 0;
      let asmFirstStart = null;
      let asmLastComplete = null;

      Object.entries(stepStates).forEach(([stepId, st]) => {
        const ts = st.timestamps || {};

        // Track timing
        if (ts.started && (!asmFirstStart || ts.started < asmFirstStart)) asmFirstStart = ts.started;
        if (ts.completed && (!asmLastComplete || ts.completed > asmLastComplete)) asmLastComplete = ts.completed;
        if (ts.started && ts.completed) {
          asmActiveMin += (new Date(ts.completed) - new Date(ts.started)) / 60000;
        }

        // Count resources by step type
        if (stepId.startsWith('pcr_')) pcrReactions++;
        if (stepId.startsWith('purif_')) purifications++;
        if (stepId === 'screening') colonyPCR++;
        if (stepId === 'sequencing') seqReactions++;
        if (st.photo) gelRuns++;
      });

      totalActiveMin += asmActiveMin;

      asmStats.push({
        name: asm.name,
        completed: asm.completed,
        fragments: (asm.fragments || []).length,
        primers: (asm.primers || []).length,
        activeMin: Math.round(asmActiveMin),
        firstStart: asmFirstStart,
        lastComplete: asmLastComplete,
      });
    });

    // Overall timing
    const allStarts = asmStats.map(a => a.firstStart).filter(Boolean);
    const allCompletes = asmStats.map(a => a.lastComplete).filter(Boolean);
    const overallStart = allStarts.sort()[0];
    const overallEnd = allCompletes.sort().pop();
    const totalDays = overallStart && overallEnd
      ? Math.ceil((new Date(overallEnd) - new Date(overallStart)) / 86400000) : null;

    return {
      assembliesTotal: assemblies.length,
      assembliesCompleted: assemblies.filter(a => a.completed).length,
      totalPrimers, reusedPrimers, pcrReactions, gelRuns, purifications, colonyPCR, seqReactions,
      totalActiveMin: Math.round(totalActiveMin),
      overallStart, overallEnd, totalDays,
      asmStats,
    };
  }, [assemblies]);

  if (stats.totalActiveMin === 0 && stats.assembliesCompleted === 0) return null;

  return (
    <div className="border rounded-lg bg-white p-4 space-y-4">
      <h3 className="text-sm font-bold text-gray-700">{'📊'} Статистика эксперимента</h3>

      {/* Overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-blue-700">{stats.assembliesCompleted}/{stats.assembliesTotal}</div>
          <div className="text-[10px] text-blue-500">сборок завершено</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-700">{fmtDur(stats.totalActiveMin)}</div>
          <div className="text-[10px] text-green-500">активной работы</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-purple-700">{stats.totalDays ? `${stats.totalDays} дн.` : '—'}</div>
          <div className="text-[10px] text-purple-500">общая длительность</div>
        </div>
      </div>

      {/* Per-assembly table */}
      {stats.asmStats.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">По сборкам</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400 text-[10px] uppercase">
                <th className="text-left p-1">Сборка</th>
                <th className="text-right p-1">Фрагм.</th>
                <th className="text-right p-1">Праймеров</th>
                <th className="text-right p-1">Активное время</th>
                <th className="text-left p-1">Начало</th>
                <th className="text-left p-1">Статус</th>
              </tr>
            </thead>
            <tbody>
              {stats.asmStats.map((a, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1 font-semibold">{a.name}</td>
                  <td className="p-1 text-right">{a.fragments}</td>
                  <td className="p-1 text-right">{a.primers}</td>
                  <td className="p-1 text-right">{fmtDur(a.activeMin)}</td>
                  <td className="p-1 text-gray-500">{fmtDate(a.firstStart)}</td>
                  <td className="p-1">
                    {a.completed
                      ? <span className="text-green-600 font-semibold">{'✓'} Готово</span>
                      : <span className="text-amber-500">В работе</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resource usage */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-2">Расход</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Праймеров заказано:</span>
            <span className="font-semibold">{stats.totalPrimers - stats.reusedPrimers}
              {stats.reusedPrimers > 0 && <span className="text-green-600 font-normal"> (+{stats.reusedPrimers} reuse)</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">ПЦР реакций:</span>
            <span className="font-semibold">{stats.pcrReactions}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Гель-электрофорезов:</span>
            <span className="font-semibold">{stats.gelRuns}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Очисток:</span>
            <span className="font-semibold">{stats.purifications}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Colony PCR:</span>
            <span className="font-semibold">{stats.colonyPCR}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Секвенирование:</span>
            <span className="font-semibold">{stats.seqReactions}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {stats.overallStart && (
        <div className="text-[10px] text-gray-400 text-center">
          {fmtDate(stats.overallStart)} → {stats.overallEnd ? fmtDate(stats.overallEnd) : 'в процессе'}
        </div>
      )}
    </div>
  );
}
