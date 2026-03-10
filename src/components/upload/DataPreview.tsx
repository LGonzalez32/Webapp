interface DataPreviewProps {
  data: any[];
  maxRows?: number;
}

export default function DataPreview({ data, maxRows = 5 }: DataPreviewProps) {
  if (!data || data.length === 0) return null;

  const headers = Object.keys(data[0]);
  const rows = data.slice(0, maxRows);

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-zinc-900 text-zinc-500 font-bold uppercase tracking-wider">
            <tr>
              {headers.map(h => (
                <th key={h} className="px-4 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-900/30">
                {headers.map(h => (
                  <td key={h} className="px-4 py-2 text-zinc-400 font-mono whitespace-nowrap max-w-[200px] truncate">
                    {row[h] !== null && row[h] !== undefined ? String(row[h]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > maxRows && (
        <div className="px-4 py-2 bg-zinc-900/50 text-[10px] text-zinc-600 font-medium border-t border-zinc-800">
          Mostrando {maxRows} de {data.length} filas
        </div>
      )}
    </div>
  );
}
