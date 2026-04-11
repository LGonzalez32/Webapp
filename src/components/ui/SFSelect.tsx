import React from 'react'
import { ChevronDown } from 'lucide-react'

type SFSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  className?: string
}

export function SFSelect({ className = '', children, style, ...props }: SFSelectProps) {
  return (
    <div className="relative inline-flex items-center">
      <select
        {...props}
        className={`appearance-none bg-[var(--sf-card)] border border-[var(--sf-border)] text-[var(--sf-t1)] text-sm font-medium px-3 py-1.5 pr-8 rounded-lg cursor-pointer outline-none focus:border-[var(--sf-emerald)] focus:ring-1 focus:ring-[var(--sf-emerald)]/30 transition-colors hover:border-[var(--sf-t5)] ${className}`}
        style={style}
      >
        {children}
      </select>
      <ChevronDown
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--sf-t3)]"
        size={14}
        strokeWidth={2.5}
      />
    </div>
  )
}
