/**
 * PCRPlanningPanel — Table of all PCR reactions from flow canvas.
 *
 * Shown below ProjectFlowCanvas when toggled. Also includes a
 * sequencing section from CheckpointNodes.
 */
import { useStore } from '../../store';

export default function PCRPlanningPanel() {
  const flowNodes = useStore(s => s.flowNodes);
  const flowEdges = useStore(s => s.flowEdges);
  const parts = useStore(s => s.parts);

  const pcrNodes = flowNodes.filter(n => n.type === 'pcrNode');
  const seqCheckpoints = flowNodes.filter(
    n => n.type === 'checkpointNode' && n.data.checkType === 'sequencing'
  );

  // For sequencing: find constructs connected to each checkpoint
  const getConnectedNames = (checkpointId) => {
    const incomingEdges = flowEdges.filter(e => e.target === checkpointId);
    return incomingEdges.map(e => {
      const sourceNode = flowNodes.find(n => n.id === e.source);
      if (!sourceNode) return '?';
      if (sourceNode.data.label) return sourceNode.data.label;
      const part = parts.find(p => p.id === sourceNode.data?.partId);
      return part?.name || sourceNode.id;
    });
  };

  if (!pcrNodes.length && !seqCheckpoints.length) return null;

  return (
    <div className="border-t bg-white p-3 max-h-60 overflow-y-auto">
      {/* PCR Table */}
      {pcrNodes.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mb-2 text-gray-800">
            PCR Plan ({pcrNodes.length} {pcrNodes.length === 1 ? 'reaction' : 'reactions'})
          </h3>
          <table className="w-full text-xs mb-3">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1 pr-2 w-8">#</th>
                <th className="py-1 pr-2">Template</th>
                <th className="py-1 pr-2">Product</th>
                <th className="py-1 pr-2">Size</th>
                <th className="py-1 pr-2">Polymerase</th>
                <th className="py-1 pr-2">Tm Fwd/Rev</th>
              </tr>
            </thead>
            <tbody>
              {pcrNodes.map((n, i) => {
                const template = parts.find(p => p.id === n.data.templatePartId);
                return (
                  <tr key={n.id} className="border-b hover:bg-gray-50">
                    <td className="py-1 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-1 pr-2">{template?.name || n.data.templatePartId || '?'}</td>
                    <td className="py-1 pr-2 font-medium">{n.data.productName || n.data.label}</td>
                    <td className="py-1 pr-2">{n.data.productLength ? `${n.data.productLength} bp` : '?'}</td>
                    <td className="py-1 pr-2">{n.data.polymerase || 'Q5'}</td>
                    <td className="py-1 pr-2 text-gray-400">
                      {n.data.tmFwd ?? '?'}° / {n.data.tmRev ?? '?'}°
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Sequencing Table */}
      {seqCheckpoints.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mb-2 text-gray-800">
            Sequencing ({seqCheckpoints.length} {seqCheckpoints.length === 1 ? 'checkpoint' : 'checkpoints'})
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1 pr-2 w-8">#</th>
                <th className="py-1 pr-2">Checkpoint</th>
                <th className="py-1 pr-2">Constructs</th>
                <th className="py-1 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {seqCheckpoints.map((cp, i) => {
                const names = getConnectedNames(cp.id);
                return (
                  <tr key={cp.id} className="border-b hover:bg-gray-50">
                    <td className="py-1 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-1 pr-2">{cp.data.label}</td>
                    <td className="py-1 pr-2">{names.length ? names.join(', ') : 'none'}</td>
                    <td className="py-1 pr-2">
                      <span className={
                        cp.data.status === 'done' ? 'text-emerald-600' :
                        cp.data.status === 'failed' ? 'text-red-600' : 'text-gray-500'
                      }>
                        {cp.data.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
