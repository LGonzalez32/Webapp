interface DataPreviewProps {
  data: any[];
  maxRows?: number;
}

function formatPreviewValue(key: string, value: any): string {
  if (key === 'fecha' || key === 'date' || key === 'mes_periodo') {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('es') : value.toFixed(2)
  }
  return String(value ?? '')
}

export default function DataPreview({ data, maxRows = 5 }: DataPreviewProps) {
  if (!data || data.length === 0) return null;

  const headers = Object.keys(data[0]);
  const rows = data.slice(0, maxRows);

  return (
    <div className="rounded-xl border border-[var(--sf-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr style={{ background: 'var(--sf-inset)' }}>
              {headers.map(h => (
                <th key={h} className="px-4 py-2.5 whitespace-nowrap font-medium text-[var(--sf-t2)] uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={i % 2 === 1 ? { background: 'var(--sf-inset)' } : undefined} className="border-t border-[var(--sf-border)]">
                {headers.map(h => (
                  <td key={h} className="px-4 py-2 text-[var(--sf-t3)] font-mono whitespace-nowrap max-w-[200px] truncate">
                    {row[h] !== null && row[h] !== undefined ? formatPreviewValue(h, row[h]) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > maxRows && (
        <div className="px-4 py-2 text-[10px] text-[var(--sf-t4)] font-medium border-t border-[var(--sf-border)]" style={{ background: 'var(--sf-inset)' }}>
          Mostrando {maxRows} de {data.length} filas
        </div>
      )}
    </div>
  );
}
