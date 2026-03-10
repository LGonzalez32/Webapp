import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { format as dateFnsFormat } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormat(date: Date | string | number | null | undefined, formatStr: string): string {
  if (!date) return 'N/A';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return dateFnsFormat(d as Date | number, formatStr);
  } catch (e) {
    return 'N/A';
  }
}

export function formatCurrency(value: number, currency: string = 'USD') {
  const symbols: Record<string, string> = {
    'USD': '$',
    'GTQ': 'Q',
    'HNL': 'L',
    'CRC': '₡',
    'NIO': 'C$',
    'DOP': 'RD$'
  };

  const symbol = symbols[currency] || '$';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'narrowSymbol'
  }).format(value).replace(currency, symbol);
}
