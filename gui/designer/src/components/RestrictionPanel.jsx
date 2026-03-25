import { useState, useMemo } from 'react';

const RE_DB = {
  EcoRI:{site:'GAATTC'},BamHI:{site:'GGATCC'},HindIII:{site:'AAGCTT'},
  XbaI:{site:'TCTAGA'},SpeI:{site:'ACTAGT'},PstI:{site:'CTGCAG'},
  SalI:{site:'GTCGAC'},NcoI:{site:'CCATGG'},NdeI:{site:'CATATG'},
  XhoI:{site:'CTCGAG'},NotI:{site:'GCGGCCGC'},NheI:{site:'GCTAGC'},
  BglII:{site:'AGATCT'},KpnI:{site:'GGTACC'},SacI:{site:'GAGCTC'},
  BsaI:{site:'GGTCTC'},BbsI:{site:'GAAGAC'},Esp3I:{site:'CGTCTC'},
  SapI:{site:'GCTCTTC'},DpnI:{site:'GATC'},EcoRV:{site:'GATATC'},
  SmaI:{site:'CCCGGG'},ClaI:{site:'ATCGAT'},AgeI:{site:'ACCGGT'},
};

const PRESETS = {
  'Common cloning':['EcoRI','BamHI','HindIII','XbaI','SpeI','PstI','SalI','NcoI','NdeI','XhoI'],
  'Golden Gate':['BsaI','BbsI','Esp3I','SapI'],
  'Verification':['EcoRI','BamHI','HindIII','NotI','XhoI','NheI'],
};

const RC = {A:'T',T:'A',G:'C',C:'G'};
const revComp = s => s.split('').reverse().map(c => RC[c]||'N').join('');

function findSites(seq, enzymes) {
  const s = seq.toUpperCase();
  return enzymes.map(name => {
    const re = RE_DB[name];
    if (!re) return {enzyme:name,site:'?',cutCount:0,positions:[]};
    const positions = [];
    const site = re.site;
    let i = s.indexOf(site); while(i!==-1){positions.push(i+1);i=s.indexOf(site,i+1);}
    const rc = revComp(site);
    if(rc!==site){i=s.indexOf(rc);while(i!==-1){positions.push(i+1);i=s.indexOf(rc,i+1);}}
    positions.sort((a,b)=>a-b);
    return {enzyme:name,site,cutCount:positions.length,positions};
  }).sort((a,b)=>a.cutCount-b.cutCount);
}

function simulateDigest(len,cuts,circ){
  if(!cuts.length) return [len];
  const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
  const frags=[];
  if(circ){for(let i=0;i<sorted.length;i++){const n=sorted[(i+1)%sorted.length];frags.push(n>sorted[i]?n-sorted[i]:len-sorted[i]+n);}}
  else{frags.push(sorted[0]);for(let i=1;i<sorted.length;i++)frags.push(sorted[i]-sorted[i-1]);frags.push(len-sorted[sorted.length-1]);}
  return frags.filter(f=>f>0);
}

function fragAt(pos,fragments){
  let off=0;for(const f of fragments){off+=(f.sequence||'').length;if(pos<=off)return f.name;}return '?';
}

export default function RestrictionPanel({sequence,fragments,circular}){
  const [enzymes,setEnzymes]=useState(PRESETS['Common cloning']);
  const [digest,setDigest]=useState([]);
  const [show,setShow]=useState(false);

  const sites=useMemo(()=>sequence?findSites(sequence,enzymes):[],[sequence,enzymes]);
  const unique=sites.filter(s=>s.cutCount===1);
  const digestFrags=useMemo(()=>{
    if(!digest.length)return[];
    const cuts=sites.filter(s=>digest.includes(s.enzyme)).flatMap(s=>s.positions);
    return simulateDigest(sequence.length,cuts,circular);
  },[digest,sites,sequence,circular]);

  if(!show) return (
    <button onClick={()=>setShow(true)} className="text-xs px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-600 w-full text-left">
      {'🔬'} Рестрикционный анализ
    </button>
  );

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-gray-700">Рестрикционный анализ</h3>
        <button onClick={()=>setShow(false)} className="text-gray-400 text-xs">{'✕'}</button>
      </div>

      <div className="flex gap-1 mb-3 flex-wrap">
        {Object.entries(PRESETS).map(([k,v])=>(
          <button key={k} onClick={()=>setEnzymes(v)} className="text-[10px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">{k}</button>
        ))}
      </div>

      <div className="max-h-[200px] overflow-y-auto mb-3">
        <table className="w-full text-xs">
          <thead><tr className="text-gray-400 uppercase text-[10px]">
            <th className="text-left p-1">Enzyme</th><th className="text-left p-1">Site</th>
            <th className="text-right p-1">Cuts</th><th className="text-left p-1">Positions</th>
            <th className="text-left p-1">Fragment</th>
          </tr></thead>
          <tbody>{sites.map(s=>(
            <tr key={s.enzyme} className={`border-t ${s.cutCount===0?'text-gray-300':s.cutCount===1?'text-green-700 bg-green-50':''}`}>
              <td className="p-1 font-semibold">{s.enzyme}</td>
              <td className="p-1 font-mono text-[10px]">{s.site}</td>
              <td className="p-1 text-right font-bold">{s.cutCount}</td>
              <td className="p-1 text-[10px]">{s.positions.slice(0,5).join(', ')}{s.positions.length>5?'...':''}</td>
              <td className="p-1 text-[10px]">{s.positions.slice(0,3).map(p=>fragAt(p,fragments)).join(', ')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {unique.length>0&&(
        <div className="bg-green-50 border border-green-200 rounded p-2 mb-3">
          <div className="text-[10px] text-green-700 font-semibold mb-1">Unique cutters ({unique.length}):</div>
          <div className="text-[10px] text-green-600">{unique.map(s=>`${s.enzyme} (${s.positions[0]})`).join(' · ')}</div>
        </div>
      )}

      <div className="border-t pt-3">
        <div className="text-xs font-semibold text-gray-600 mb-2">Diagnostic Digest</div>
        <div className="flex gap-1 mb-2 flex-wrap">
          {sites.filter(s=>s.cutCount>0&&s.cutCount<=5).map(s=>(
            <button key={s.enzyme} onClick={()=>setDigest(d=>d.includes(s.enzyme)?d.filter(e=>e!==s.enzyme):[...d,s.enzyme])}
              className={`text-[10px] px-2 py-0.5 rounded border ${digest.includes(s.enzyme)?'bg-blue-100 border-blue-400 text-blue-700':'border-gray-200'}`}>
              {s.enzyme} ({s.cutCount}{'×'})
            </button>
          ))}
        </div>
        {digestFrags.length>0&&(
          <div className="flex items-end gap-1 h-24 bg-gray-50 rounded p-2">
            {digestFrags.sort((a,b)=>b-a).map((sz,i)=>{
              const h=Math.max(8,Math.min(85,(Math.log10(sz)-1.5)/2.5*85));
              return(
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="text-[7px] text-gray-500">{sz}</span>
                  <div className="w-5 bg-blue-400 rounded-t" style={{height:`${h}%`,marginTop:'auto'}}/>
                </div>
              );
            })}
            <div className="text-[8px] text-gray-400 ml-2">{digest.join('+')} {'→'} {digestFrags.length} frags</div>
          </div>
        )}
      </div>
    </div>
  );
}
