import React from 'react'
import { Search } from 'lucide-react'

type SFSearchProps = React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string
}

export function SFSearch({ className = '', style, ...props }: SFSearchProps) {
  return (
    <div className="relative flex items-center">
      <Search
        className="absolute left-3 text-[var(--sf-t4)] pointer-events-none"
        size={14}
        strokeWidth={2}
      />
      <input
        type="search"
        {...props}
        className={`bg-[var(--sf-card)] border border-[var(--sf-border)] text-[var(--sf-t1)] placeholder:text-[var(--sf-t4)] text-sm pl-9 pr-3 py-1.5 rounded-lg outline-none focus:border-[var(--sf-emerald)] focus:ring-1 focus:ring-[var(--sf-emerald)]/30 transition-colors ${className}`}
        style={style}
      />
    </div>
  )
}
