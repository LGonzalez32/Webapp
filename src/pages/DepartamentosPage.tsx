import { useState, useMemo, useCallback, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { callAI } from '../lib/chatService'

// ─── Paths oficiales de simplemaps.com (viewBox 0 0 1000 547) ─────────────────
const DEPTS: Record<string, { path: string; lx: number; ly: number; area: 'sm' | 'md' | 'lg' }> = {
  'Ahuachapán': {
    path: 'M183.1 180l3.2 1.3 6.8 4.3 1.3 1.2 0.7 0.8 0.4 0.8 0.8 3.2 0.4 0.9 0.6 0.9 1.3 1.3 1.6 1.2 1.3 1.4 0.1 0.1 0.8 1.5 0.3 0.9-1.1 6.9-7.5 25.9-6.7 2.8-8.2 2.3-4.6 0.7-1 0.7-0.8 1.1-0.4 2.5-0.1 1.6 0.9 7.2 0.6 2.3 0.7 1.7 0.9 1.8 0.3 0.9-0.2 1.3-7.6 11.7-0.7 2.1-0.2 1.6 3.1 10 0.4 2.2-0.5 1.5-1.1 1.8-2.8 3.4-1.1 2.1-0.6 1.6-0.3 3.6-0.3 1-4.8 8.6-0.7 1.9-2.1 8.6-1.9 0.8-3.1 0.4-11.3-0.7-2.3-0.5-0.8-0.5-2.7-2.6-4.9-5.7-0.8-0.6-1.5-1.1-0.9-0.4-1-0.4-1.4-0.1-1.5 0-2.1 0.4-1.3 0.4-1.1 0.5-0.9 0.6-1.1 0.9-2.8 3.4-5.9 9.4-0.9 1.4-25.4-11.6-29-14-6-25.1-0.1-6 0.9-6.3 2-6.1 3-5.6 4.5-4.6 10.3-5.5 4.6-3.8 3.4-5.4 2.5-5.6 3.2-5.5 5.6-4.9 36.1-25.3 7.9-8 4-2.7 16.7-6.3 5.5-0.4 6.8 1.8 9.8 7.6 5.5 2.3 5.5-3 0.1-2.2-0.3-0.6z',
    lx: 124.3, ly: 249.3, area: 'lg',
  },
  'Santa Ana': {
    path: 'M194.1 232.6l7.5-25.9 1.1-6.9-0.3-0.9-0.8-1.5-0.1-0.1-1.3-1.4-1.6-1.2-1.3-1.3-0.6-0.9-0.4-0.9-0.8-3.2-0.4-0.8-0.7-0.8-1.3-1.2-6.8-4.3-3.2-1.3-2.4-5.6-0.3-3 1-3.2 16.1-28.4 7.5-8.2 9.4-7.3 9.9-4.6 40.3-9.7 2.5-2.4-0.1-6-1.2-1.6-4.8-2.4-1.6-1.6-0.7-2.5-0.7-5.9-0.5-1.8-2.2-4.2-1-1.5-2.2-2-2.6-1.2-7.9-1-2.3-5.5 2.2-3.3 3.8-2.7 2.4-3.8-1.1-4.5-2.7-3.8-1.7-4.4 2.5-6.1 5.3-4 5.5 0.5 4.1 4.1 1.1 7.2 5.1-3.7 9.3-11.2 2.6-1.1 4.1-1.8 5.9 0.8 4.3 2.3 4.2 1.5 5.9-1.2 8.6-8.8 3.8-1.5 0.5 7.5 1.9-3 0.4-0.9 10.8 7.9 0.1 0.1 5.8 0.9 14.3 13.4 2.5 2.8 0.5 0.7 1.2 2.9 1.7 2.9 0.8 0.8 1.3 1.1 5.6 2.9 0.8 0.7 1.8 2.4 6.9 4.4-4.8 14-1.5 7.8-3.3 3.7-14 5.7 0 7.7 0.3 4.3-0.1 1.5-0.7 1.8-7.3 10.1-1.3 1.3-0.8 0.6-0.8 0.5-1 0.3-1 0.3-1.2 0.2-3.8 0.2-1 0.2-1 0.3-0.9 0.4-0.8 0.5-0.7 0.6-4.4 8.1-0.9 1.2-0.7 0.7-0.9 0.5-0.9 0.4-7.1-0.5-7.2 24.8 1.1 8.4 4.2 3.8 5.6 1.1 5.6 0 4.4-1.2-4 21.4-0.7 5.5 0.1 1.2-0.6 7.5-0.4 1.2-0.8 1-1.9 0.9-1.4 0-1.3 0-1 0.1-0.8 0.4-3 4.9-1.2 0.8-1.1 0.1-0.9-0.3-1-0.1-0.9 0.3-0.8 0.5-0.6 0.8-0.5 2.1-0.5 10.4 0.4 6.9-0.7 8.3-6.6 18-1.8 10.7-17.9-3.4-4.7-1.6-0.6-0.8-0.6-0.8-2.2-5.6-5-4.7-8-5.9-3.6-2.2-2.5-1.1-1 0.2-0.8 0.6-0.6 0.7-1 1.6-1.2 2.8-0.5 2.1 0 3.5-0.3 0.9-0.8 0.9-1.4 0.7-2.7 0.6-1.7-0.4-1.2-0.4-0.9-0.7-0.6-0.7-0.5-0.9-0.4-1.2-0.9-1.3-1.7-1.8-2.4-0.4-1.2-0.8-0.5-0.8 0.2-1 0.4-0.8 0.7-0.8 1.4-1.2 0.6-0.6 0.5-0.9 0.3-1.1 0.1-1-0.4-2-1.7-2.8-2.3-2.1-1.2-1.3-0.8-1.1-1.2-2.8-1.1-1.5-6.1-6-2.2-1.6-1.7-0.8-1.2 0-1.1 0.1-2.1 0.6-3.4 0.1-8.7-2.2z',
    lx: 251.3, ly: 168.8, area: 'lg',
  },
  'Sonsonate': {
    path: 'M106 326.8l0.9-1.4 5.9-9.4 2.8-3.4 1.1-0.9 0.9-0.6 1.1-0.5 1.3-0.4 2.1-0.4 1.5 0 1.4 0.1 1 0.4 0.9 0.4 1.5 1.1 0.8 0.6 4.9 5.7 2.7 2.6 0.8 0.5 2.3 0.5 11.3 0.7 3.1-0.4 1.9-0.8 2.1-8.6 0.7-1.9 4.8-8.6 0.3-1 0.3-3.6 0.6-1.6 1.1-2.1 2.8-3.4 1.1-1.8 0.5-1.5-0.4-2.2-3.1-10 0.2-1.6 0.7-2.1 7.6-11.7 0.2-1.3-0.3-0.9-0.9-1.8-0.7-1.7-0.6-2.3-0.9-7.2 0.1-1.6 0.4-2.5 0.8-1.1 1-0.7 4.6-0.7 8.2-2.3 6.7-2.8 8.7 2.2 3.4-0.1 2.1-0.6 1.1-0.1 1.2 0 1.7 0.8 2.2 1.6 6.1 6 1.1 1.5 1.2 2.8 0.8 1.1 1.2 1.3 2.3 2.1 1.7 2.8 0.4 2-0.1 1-0.3 1.1-0.5 0.9-0.6 0.6-1.4 1.2-0.7 0.8-0.4 0.8-0.2 1 0.5 0.8 1.2 0.8 2.4 0.4 1.7 1.8 0.9 1.3 0.4 1.2 0.5 0.9 0.6 0.7 0.9 0.7 1.2 0.4 1.7 0.4 2.7-0.6 1.4-0.7 0.8-0.9 0.3-0.9 0-3.5 0.5-2.1 1.2-2.8 1-1.6 0.6-0.7 0.8-0.6 1-0.2 2.5 1.1 3.6 2.2 8 5.9 5 4.7 2.2 5.6 0.6 0.8 0.6 0.8 4.7 1.6 17.9 3.4 4.3 1.4 0.9 0.4 0.8 0.6 0.7 0.6 0.5 0.8 0.3 1 0.2 1-0.5 1.5-1 1.5-2.7 2.4-2.4 1.7-5.5 3.2-2.1 1.9-4.4 5.5-1.5 1.2-1.5 0.6-2.6 0.3-0.9 0.2-1.5 0.9-0.8 0.7-0.8 1.4-0.8 2.1-1.1 4.6-0.6 4.5 0.5 8.5-0.1 1.3-1 1.8-1.9 2.6-8.2 8.2-0.7 0.5-0.8 0.8-0.9 1.2-0.8 1.9-0.7 3.2-0.5 4.7-1.1 1.5-1.6 1.9-9.5 8.4-2 3.2-4 9.1-1 2.5-2.6-0.6-23.8-7.8-12.6 2.6-35.6 0.4-5.7-3.9-3.8-14.2-1.4-8.9-4.7-3.9-7.8-4.8-30.4-17.3-0.8-0.4z',
    lx: 208.7, ly: 323.8, area: 'lg',
  },
  'Chalatenango': {
    path: 'M324.5 181.7l-4.4 1.2-5.6 0-5.6-1.1-4.2-3.8-1.1-8.4 7.2-24.8 7.1 0.5 0.9-0.4 0.9-0.5 0.7-0.7 0.9-1.2 4.4-8.1 0.7-0.6 0.8-0.5 0.9-0.4 1-0.3 1-0.2 3.8-0.2 1.2-0.2 1-0.3 1-0.3 0.8-0.5 0.8-0.6 1.3-1.3 7.3-10.1 0.7-1.8 0.1-1.5-0.3-4.3 0-7.7 14-5.7 3.3-3.7 1.5-7.8 4.8-14-6.9-4.4-1.8-2.4-0.8-0.7-5.6-2.9-1.3-1.1-0.8-0.8-1.7-2.9-1.2-2.9-0.5-0.7-2.5-2.8-14.3-13.4 14.5 2.3 11.6 5.6 19.2 4.1 9.5 6.7 17.3 5.2 3.6-3.2 5.4-10.5 3-3.1 3.3-0.9 2.2 0.4 1.9 1.7 2.1 3 1.9 3.5 0.8 3.9-0.3 3.9-1.5 3.8 4.3 3.7 12.8 1.5 6 3 2.4 4.8 1.5 11.9 1.7 3.5 9.5 7.2 3.4 4.2 3.4 5.7 1.4 4.9 0.2 1.8 0.4 3.2 1.2 4.1 3.3 2.4 3.7-0.8 4.4-2.6 5.3-2.3 5.8 0.1 9.3 6 7.9 9.9 5.6 11.6 2.5 10.9 6.6-1 16.4 1.3 4.5-1.8 3.9-2.4 3.3-0.3 2.7 4.4-0.4 6.5-2.2 6.4-0.2 5.5 5.9 3.8 8 1.1 1.8 0.6 2.7 2.4 1.8 2.6 0.9 3.2-0.2 2-17.3 2.6-7.7 3.8-2.9 3.8-2.5 2-4.5 2.1-23.1 7.6-5.6 2.1-5.2 1.3-9.8-0.9-11.1 0.3-6.2-0.7-5.8-2.2-6.8 0.5-8-3.8-1.4-0.9-1.7-1.6-2-2.9-1-2.1-0.6-1.8-0.3-1-0.1-0.9 0-1.1 0.3-1.6 0-0.1-0.2-0.7-0.7-1-8.2-9.8-1.7-3-0.6-0.8-6.3-4.5-2.7-2.4-1.9-1.1-9.7-3.5-4.7-2.4-1.3-0.1-1.2 0-6.6 3.4-10.4 4.8-4.2-1-5.3-4.2-2.4 4.8-5.2-0.1-7.8-3.4-2.9 1-4.9 3.5-1.5 0.8-2.7-0.4-3.6-1.7-1.2-0.3-6.1-0.9-6.8-3.9-3.9-0.8-3.6 2.8-3.5 1.9-4.4 0.9-3.1 1.2-1.2 2.6-1.7 2.7z',
    lx: 413.2, ly: 117.2, area: 'lg',
  },
  'La Libertad': {
    path: 'M292.5 284.3l1.8-10.7 6.6-18 0.7-8.3-0.4-6.9 0.5-10.4 0.5-2.1 0.6-0.8 0.8-0.5 0.9-0.3 1 0.1 0.9 0.3 1.1-0.1 1.2-0.8 3-4.9 0.8-0.4 1-0.1 1.3 0 1.4 0 1.9-0.9 0.8-1 0.4-1.2 0.6-7.5-0.1-1.2 0.7-5.5 4-21.4 1.7-2.7 1.2-2.6 3.1-1.2 4.4-0.9 3.5-1.9 3.6-2.8 3.9 0.8 6.8 3.9 6.1 0.9 1.2 0.3 3.6 1.7-0.4 13-2 8.3-0.1 2.1 0.2 1.4 2.3 1.8 0.9 1.3 1.1 2 1.9 4.4 1.1 2.1 1 1.4 1.6 1 1.8 0.9 3 0.9 1.1 0.1 3.5-0.3 1.2 0 1.1 0.2 1.1 0.2 1 0.4 1.2 0.7 1.4 1.1 2 1.1 0.6 0.8 0.1 0.6-1 2.6-0.5 2.2-0.1 0.4-0.3 0.3-2.8-0.1-1 0.3-0.7 0.7-0.4 1.2-1.9 21.6-0.5 2.2-0.4 0.9-0.8 0.5-1.9 0.7-0.9 0.5-0.7 0.6-1.2 1.4-0.7 1.9-0.5 1.8-0.7 6.8-0.8 3-1.2 2.8-0.7 3.6-0.4 6.2-0.3 1.6-0.3 1-2.6 4.9-1.7 4.8 0.2 1.5 0.6 0.8 1 0.3 1.2 0.1 1.9 2.5-0.4 3.8 0.3 3.7 0.4 1 0.5 0.8 0.6 0.7 1.5 1.1 0.7 0.9 0.4 1.3 0.7 3 0.6 1.7 0.7 1.1 0.8 0.6 5.4 2.9 0.7 0.5 1.6 1.4 2.5 3.4 0.4 1.4-0.2 1.2-1.2 2.3-0.9 2.2 0.1 1.2 0.8 0.8 2.9 1.4 0.4 0.9-0.2 0.9-0.6 0.7-0.7 0.6-0.6 2.2-0.2 3.7 0.7 15.9-0.2 1.2-2.4 6.1-0.8 3.4-0.1 1.8 0.2 1.4 6 9.8 2.1 4.6 0.6 0.7 0.8 0.4 1.1 0.2 1.2-0.1 2.1-0.5 3.9-1.3 2.2-0.3 1.4 0.2 1 0.3 2.8 1.2 1.3 6.3 1.1 1.6 0.9 0 1.6 0.1 2 0.5 3.7 1.5 1.3 1.3 0.3 1.1-1 1.7-1.8 2.2-0.5 0.8-0.6 0.7-2.9 5.2-1 2.3-1.2 3.6-17.9-11-25.5-11.3-27.6-6.6-12.8 0-9.8-2.3-53.3 0.5-22.8-5.8-8.1-1.5 1-2.5 4-9.1 2-3.2 9.5-8.4 1.6-1.9 1.1-1.5 0.5-4.7 0.7-3.2 0.8-1.9 0.9-1.2 0.8-0.8 0.7-0.5 8.2-8.2 1.9-2.6 1-1.8 0.1-1.3-0.5-8.5 0.6-4.5 1.1-4.6 0.8-2.1 0.8-1.4 0.8-0.7 1.5-0.9 0.9-0.2 2.6-0.3 1.5-0.6 1.5-1.2 4.4-5.5 2.1-1.9 5.5-3.2 2.4-1.7 2.7-2.4 1-1.5 0.5-1.5-0.2-1-0.3-1-0.5-0.8-0.7-0.6-0.8-0.6-0.9-0.4-4.3-1.4z',
    lx: 325.4, ly: 339.5, area: 'lg',
  },
  'San Salvador': {
    path: 'M363.6 177.2l2.7 0.4 1.5-0.8 4.9-3.5 2.9-1 7.8 3.4 5.2 0.1 2.4-4.8 5.3 4.2 4.2 1 10.4-4.8-0.2 3.8-1.7 4.6-1.8 3.7-0.3 1.2 0.1 1.7 1.2 6.4 0.3 3.7-0.1 0.7 0 0.4-0.2 1.6-0.5 2.1-0.3 2.3-0.3 1.1-0.3 0.9-1 1.6-0.7 0.6-0.7 0.6-0.6 0.5-0.2 0.6 0.4 3.3 0.8 2.9 3.5 7.4 7.8 12.8 2.3 3 0.4 0.8-0.7 1.5-0.7 0.8-1 0.7-2.7 1.2-0.7 0.6 1.1 3 10 15.7 3.4 4 2.6 2.1 2.4 0.1 1.1 0.2 1 0.4 0.7 0.6 4.7 7 1.6 1.6 1.4 1 1 0.3 0.7 1.1 0.3 1.7-0.6 8.3 0.5 1.8 6.6 12.5 1.8 2.3 0.7 2 0.8 2 0.3 11.6-13.6 12.8-11.3 14.4-1.9 1.5-1.1-0.1-1.2-0.2-6-1.9-1.1-0.2-1.2 0-1 0.2-0.9 0.5-0.5 1.2-0.2 1.8 0.7 3.3 1.1 3.1 2.9 5.1 0.7 1.9-0.2 2.7-0.8 4.2-3.2 9.6-1.9 4.1-2.7 3-1.1 0.7-0.8 3.2-2.8-1.2-1-0.3-1.4-0.2-2.2 0.3-3.9 1.3-2.1 0.5-1.2 0.1-1.1-0.2-0.8-0.4-0.6-0.7-2.1-4.6-6-9.8-0.2-1.4 0.1-1.8 0.8-3.4 2.4-6.1 0.2-1.2-0.7-15.9 0.2-3.7 0.6-2.2 0.7-0.6 0.6-0.7 0.2-0.9-0.4-0.9-2.9-1.4-0.8-0.8-0.1-1.2 0.9-2.2 1.2-2.3 0.2-1.2-0.4-1.4-2.5-3.4-1.6-1.4-0.7-0.5-5.4-2.9-0.8-0.6-0.7-1.1-0.6-1.7-0.7-3-0.4-1.3-0.7-0.9-1.5-1.1-0.6-0.7-0.5-0.8-0.4-1-0.3-3.7 0.4-3.8-1.9-2.5-1.2-0.1-1-0.3-0.6-0.8-0.2-1.5 1.7-4.8 2.6-4.9 0.3-1 0.3-1.6 0.4-6.2 0.7-3.6 1.2-2.8 0.8-3 0.7-6.8 0.5-1.8 0.7-1.9 1.2-1.4 0.7-0.6 0.9-0.5 1.9-0.7 0.8-0.5 0.4-0.9 0.5-2.2 1.9-21.6 0.4-1.2 0.7-0.7 1-0.3 2.8 0.1 0.3-0.3 0.1-0.4 0.5-2.2 1-2.6-0.1-0.6-0.6-0.8-2-1.1-1.4-1.1-1.2-0.7-1-0.4-1.1-0.2-1.1-0.2-1.2 0-3.5 0.3-1.1-0.1-3-0.9-1.8-0.9-1.6-1-1-1.4-1.1-2.1-1.9-4.4-1.1-2-0.9-1.3-2.3-1.8-0.2-1.4 0.1-2.1 2-8.3 0.4-13z',
    lx: 406.6, ly: 297.7, area: 'md',
  },
  'Cuscatlán': {
    path: 'M410.9 171.4l6.6-3.4 1.2 0 1.3 0.1 4.7 2.4 9.7 3.5 1.9 1.1 2.7 2.4 6.3 4.5 0.6 0.8 1.7 3 8.2 9.8 0.7 1 0.2 0.7 0 0.1-0.3 1.6 0 1.1 0.1 0.9 0.3 1 0.6 1.8 1 2.1 2 2.9 1.7 1.6 1.4 0.9 8 3.8 6.8-0.5 5.8 2.2 6.2 0.7-5.5 8.8-0.4 0.9-1.1 1.6-1.3 1.4-1.4 1.2-5 2.9-0.8 0.6-0.6 0.6-0.6 0.9-0.3 0.9-0.3 1-0.2 1.2 0.9 2.5 1.8 3.3 7.3 10.4 2.3 2.4 3.1 2.1 1.8 2.1 1.4 3 0.3 1.7 0.4 1.6 1.9 3.4 0.5 1.5 0.5 2.5 0.9 1.7 1.5 2 3.6 3.9 2.4 3.7 0.4 1 3.4 1.9 13 3.6-6.9 18.3-1.3 5.4-0.9 1.8-0.8 1.3-7.3 7.2-2.6 1.6-2.1 0.7-4.7 0.6-1 0.3-0.8 0.4-0.7 0.8-0.8 1.8-0.6 0.7-0.8 0.4-0.7 0.2-1.7 0.3-1.3 0-7.1-2.2-6.5-3.5-16.5-6.1-0.3-11.6-0.8-2-0.7-2-1.8-2.3-6.6-12.5-0.5-1.8 0.6-8.3-0.3-1.7-0.7-1.1-1-0.3-1.4-1-1.6-1.6-4.7-7-0.7-0.6-1-0.4-1.1-0.2-2.4-0.1-2.6-2.1-3.4-4-10-15.7-1.1-3 0.7-0.6 2.7-1.2 1-0.7 0.7-0.8 0.7-1.5-0.4-0.8-2.3-3-7.8-12.8-3.5-7.4-0.8-2.9-0.4-3.3 0.2-0.6 0.6-0.5 0.7-0.6 0.7-0.6 1-1.6 0.3-0.9 0.3-1.1 0.3-2.3 0.5-2.1 0.2-1.6 0-0.4 0.1-0.7-0.3-3.7-1.2-6.4-0.1-1.7 0.3-1.2 1.8-3.7 1.7-4.6 0.2-3.8z',
    lx: 446.2, ly: 245.2, area: 'md',
  },
  'La Paz': {
    path: 'M413 423.6l1.2-3.6 1-2.3 2.9-5.2 0.6-0.7 0.5-0.8 1.8-2.2 1-1.7-0.3-1.1-1.3-1.3-3.7-1.5-2-0.5-1.6-0.1-0.9 0-1.1-1.6-1.3-6.3 0.8-3.2 1.1-0.7 2.7-3 1.9-4.1 3.2-9.6 0.8-4.2 0.2-2.7-0.7-1.9-2.9-5.1-1.1-3.1-0.7-3.3 0.2-1.8 0.5-1.2 0.9-0.5 1-0.2 1.2 0 1.1 0.2 6 1.9 1.2 0.2 1.1 0.1 1.9-1.5 11.3-14.4 13.6-12.8 16.5 6.1 6.5 3.5 7.1 2.2 1.3 0 1.7-0.3 0.7-0.2 0.8-0.4 0.6-0.7 0.8-1.8 0.7-0.8 0.8-0.4 1-0.3 4.7-0.6 2.1-0.7 2.6-1.6 2.8 7.6 0.1 6.3-0.4 6.6 0.4 2.6 0.7 1.6 1.2 0.1 1.2 0 1.2-0.2 8.9-2.8 1.6-0.1 1.7 0.3 2.9 1.1 1 1.3 9.3 19.8 0.3 1.1 0.1 1.1-0.1 2.5-0.4 2.2-2.9 7.9-0.2 0.9-0.3 0.9-0.3 1.3 0 0.6 0 0.1-1.6 8.4 0 1.8 0.5 6.7 0.5 2.2 0.6 1.6 2.4 2.7 2.3 1.8 3.3 2 2.6 2.5 2.4 3.2 0.9 2 0.4 1.6-0.2 1.2-0.5 2.2-0.3 0.9-0.5 0.9-2.3 1.7-0.6 0.7-0.5 0.8-0.3 1-0.1 1.2-0.1 1.2 1.7 15.8-0.1 2.2-0.5 0.8-0.6 0.7-0.7 0.8-0.8 0.5-3.5 1.7-2.7 1.1-1.7 1-1.5 1.2-0.6 0.7-0.5 0.8-0.5 1-0.3 0.9-0.3 1.1-0.9 11.6 0 0.1-87.6-40.9-26.6-16.4z',
    lx: 478.8, ly: 400, area: 'lg',
  },
  'Cabañas': {
    path: 'M490.3 217.5l11.1-0.3 9.8 0.9 5.2-1.3 5.6-2.1 23.1-7.6 4.5-2.1 2.5-2 2.9-3.8 7.7-3.8 17.3-2.6 0 0.7 2.3-0.9 9.5-1.5 9.6 0.7 28.4 9.1 16.6 1.2 3.6 1.6 3.4 3.3-0.3 1.2-0.1 0.9-0.2 0.2-0.4 0.3-0.1 0-1.5-0.2 0.4 0.9 1.9 4.2-0.2 4.5-1.3 4.7-0.8 5.7 1 3.7 4.1 10.2 0.3 6.1-3.3 5.5-0.7 0.6-1.7 1.5 2.4 4.8-0.6 4.6-2.6 3.9-4.1 2.6 0.8 5.3-3.5 5.4-3.4 6.7 0 0.1-6.1 4.1-3.5-0.9-9.5-1.2-1.4-0.5-0.7-0.6-0.5-0.8-0.3-1-0.4-2.1-0.6-0.9-1-0.5-2.6-0.7-0.9-0.4-2.6-1.5-3.9-1.4-0.9-0.5-6.9-5.1-0.9-0.4-4.1-0.8-5.2-0.3-2.4-0.4-12 0.1-2.7-0.2-1.8-0.5-5.4-3.9-1.2 0.1-1.4 0.7-1.9 2.5-1.2 1.3-1.3 0.8-2.2-0.2-2.7-0.6-2.5 0.6-11.7 5.2-3.6 1.2-2.6 0.4-3.9-1.3-2.2-0.5-2.4-0.1-1 1.4-0.7 1.2-0.5 11.1-13-3.6-3.4-1.9-0.4-1-2.4-3.7-3.6-3.9-1.5-2-0.9-1.7-0.5-2.5-0.5-1.5-1.9-3.4-0.4-1.6-0.3-1.7-1.4-3-1.8-2.1-3.1-2.1-2.3-2.4-7.3-10.4-1.8-3.3-0.9-2.5 0.2-1.2 0.3-1 0.3-0.9 0.6-0.9 0.6-0.6 0.8-0.6 5-2.9 1.4-1.2 1.3-1.4 1.1-1.6 0.4-0.9 5.5-8.8z',
    lx: 580.5, ly: 233.6, area: 'lg',
  },
  'San Vicente': {
    path: 'M520.2 293.8l0.5-11.1 0.7-1.2 1-1.4 2.4 0.1 2.2 0.5 3.9 1.3 2.6-0.4 3.6-1.2 11.7-5.2 2.5-0.6 2.7 0.6 2.2 0.2 1.3-0.8 1.2-1.3 1.9-2.5 1.4-0.7 1.2-0.1 5.4 3.9 1.8 0.5 2.7 0.2 12-0.1 2.4 0.4 5.2 0.3 4.1 0.8 0.9 0.4 6.9 5.1 0.9 0.5 3.9 1.4 2.6 1.5 0.9 0.4 2.6 0.7 1 0.5 0.6 0.9 0.4 2.1 0.3 1 0.5 0.8 0.7 0.6 1.4 0.5 9.5 1.2 3.5 0.9 6.1-4.1 1 9.1 11.6 11.6 4.3 6.8-23.6 17.2-2.1 6.8-5.6 7.7-7.5 4.8-8.3-1.9-10.8 13.4-0.5 2.4-6.2 1.1-2.1 3-0.9 11.7-3.2 11.5-17.1 32.6-1.6 4.1-0.9 4.9-0.5 12-0.9 2.6-6.6 6.4-3.5 5.2-2.2 4.2-3.6 2.9-7.3 1.1-4.5 1.7-2.8 3.8-1.5 5.5 0 0.8 0.2 0.1-5.6-2.6 0-0.1 0.9-11.6 0.3-1.1 0.3-0.9 0.5-1 0.5-0.8 0.6-0.7 1.5-1.2 1.7-1 2.7-1.1 3.5-1.7 0.8-0.5 0.7-0.8 0.6-0.7 0.5-0.8 0.1-2.2-1.7-15.8 0.1-1.2 0.1-1.2 0.3-1 0.5-0.8 0.6-0.7 2.3-1.7 0.5-0.9 0.3-0.9 0.5-2.2 0.2-1.2-0.4-1.6-0.9-2-2.4-3.2-2.6-2.5-3.3-2-2.3-1.8-2.4-2.7-0.6-1.6-0.5-2.2-0.5-6.7 0-1.8 1.6-8.4 0-0.1 0-0.6 0.3-1.3 0.3-0.9 0.2-0.9 2.9-7.9 0.4-2.2 0.1-2.5-0.1-1.1-0.3-1.1-9.3-19.8-1-1.3-2.9-1.1-1.7-0.3-1.6 0.1-8.9 2.8-1.2 0.2-1.2 0-1.2-0.1-0.7-1.6-0.4-2.6 0.4-6.6-0.1-6.3-2.8-7.6 7.3-7.2 0.8-1.3 0.9-1.8 1.3-5.4 6.9-18.3z',
    lx: 567.9, ly: 326.5, area: 'md',
  },
  'Usulután': {
    path: 'M656.4 317.9l15.4-1.8 4.4 0.3 2.3 2.9 3.2 5 2.5 2.4 3.3 2.3 2.9 1 9.2 1.2 2.3 0.7 1.2 1 0 1.1-1.8 5-0.2 1.1 0 1.2 0.7 3.2 1.1 2.7 0.5 1.6 0.2 1.4-0.2 1-0.3 1-0.6 0.8-0.6 0.7-0.8 0.4-2.1 0.7-0.8 0.5-0.6 0.7-0.5 0.8-0.3 1-0.1 1.2 0 2.3 0.2 1.1 0.3 1 4.5 9.6 0.5 1.5 0 0.9-0.8 3 0 1.6 0.3 2 1.5 5.1 0.2 1.5-0.1 0.8-0.5 1-0.1 0.1-2 1.9-0.6 0.7-0.5 0.9-0.3 1-0.1 1.2 0.1 2.3-0.2 2.4-0.4 1-0.5 0.6-0.7 0-0.6-0.5-0.5-0.6-0.4-0.4-0.6-0.2-0.7 0.2-0.6 0.7-0.3 1-0.1 1.2 0.1 1.1 0.6 5.2 0.1 2.5 1.2 7.1 0.4 1.2 0.6 0.4 0.6 0.1 1.8-0.7 1.5 0.5 0.6 1 0.2 1.2-0.1 2.5 0.2 2.3 0.6 3 2 6.9 2 4.1 3.8 6.1 2.6 3.4 0.7 0.5 0.8 0.5 2.8 1.3 2 0.5 7.4 0.8 1.7 1 1.9 1.6 3.3 4 1.6 1.4 1.1 0.8 0.9-0.1 1.1 0.1 0.9 0.4 0.8 0.5 1.5 1.2 0.8 0.5 0.9 0.4 1.1 0.1 1 0 1.1-0.3 1.9-0.8 3.5-1.9 1.2-0.1 1.6 0.2 1.2 1.4 0.7 1.1 0.3 1.2 0.2 1.1 0 5.7 0.9 1.4 1.4 1.2 2.5 1.3 0.9 1.2 0.2 1.1-2.8 5.1-0.4 1.3-0.2 1.2 0.1 1.9 0.7 0.8 0.9 0.2 10.2-1.6 1.2 0.1 1 0.2 1 0.4 23 26.8-3.5 1.4-32.4 2.7-34.8-5.3-9 2.9-4.8-1.6-5.5-1.2 0-2.4 8.5-0.6 0.6-5.9-4.5-7.4-6.9-4.8 1.5 3 4.5 6.3 1.7 3.9-13.6-0.5-6.6 0.7-5.7 2.4 3.7 1.6 2.9-0.5 3.5-1 5.3-0.1 0 2.9-8.7 3.6-9.7-0.3-7.5-4.6-2.3-9.5 3.7 1.7 1.4 0.9 5.2-5.2 0-2.4-6.5-2.9-7-10-4.7-2.9 1.2 5.5 2.2 4.6 1.1 4.1-1.7 4-5.5-3.2-15.9-4-6.8-3.6-6.2-11.1-2.9-1.8-4.4-0.4-12.4-2.5-5.5 0-15.2 2.9-21.2 0.5-4.7 2.1 2.6 2 2.7 1.5 2.8 0.5 2.4-1.1 10.6 2.4 30.2-3.2 3.3 0.5 4.9 2.7 2.6 2.4 4.7 5.7 3.1 2.4 0 2.9-7-1.2-5.1-1-11.2-3.3 0 2.6 30.8 6.3 16.1 5.3 7.2 7.1-2.7 4.6-6.7-1.1-7.5-4-4.9-3.7-5.5-2.8-97-18.1-11.6-5.4-0.2-0.1 0-0.8 1.5-5.5 2.8-3.8 4.5-1.7 7.3-1.1 3.6-2.9 2.2-4.2 3.5-5.2 6.6-6.4 0.9-2.6 0.5-12 0.9-4.9 1.6-4.1 17.1-32.6 3.2-11.5 0.9-11.7 2.1-3 6.2-1.1 0.5-2.4 10.8-13.4 8.3 1.9 7.5-4.8 5.6-7.7 2.1-6.8 23.6-17.2z',
    lx: 635.8, ly: 419.6, area: 'lg',
  },
  'San Miguel': {
    path: 'M639.5 290.4l0-0.1 3.4-6.7 3.5-5.4-0.8-5.3 4.1-2.6 2.6-3.9 0.6-4.6-2.4-4.8 1.7-1.5 0.7-0.6 10-0.5 7-4.3 6.8-2.9 15.2-3.3 3.5 0.2 6 2.3 2.8 0.3 0.4-1.1 0-2.3 0.3-2.4 1.2-1.4 2.4-0.1 3 0.5 3 0.9 2.4 1 2.6-4.8 4.1-1.5 4.5-0.4 4.1-1.4 3-2.8 1.2-2.3 2.1 2.9 4.4 10.4 0.7 3.1 0.1 1.3 0.6 1.7 1.5 2.9 1.2 3.2 0 2.3-0.2 1.1-0.4 1-0.4 0.8-0.6 0.8-0.6 0.7-0.8 0.5-0.7 0.6-1.1 1.4-0.5 0.8-0.2 0.7-0.2 0.7-0.3 2.1 0.1 3.8 0.3 1 0.3 1 1.4 1.5 2.1 1.9 14.2 9.7 0.8 1 1 1.5 0.7 2.3 0 1.4-0.3 1.1-0.6 0.7-0.7 0.7-0.9 0.5-2.9 1-1.7 1-12.3 8.9-0.7 0.7-0.4 0.8 0 1 0.6 9.7 1.2 1.8 1.9 2.3 4.8 4.3 1.2 1.9 0.7 2.3 1.4 1.4 3.5 2.6 1.4 1.9 0.8 1.5 0.2 1.1 0.3 1.1 0.3 0.9 0.6 0.7 0.8 0.7 2.7 1.7 0.9 0.9 0.6 1-0.1 1-0.4 0.9-2.2 3-0.5 0.9 0.1 0.6 0.6 0.5 2.1-0.6 3-1.8 1.9-0.8 2.1-0.4 14.6-1.2 1.4 0.5 1.3 0.8 1.6 2.1 1.4 2.6 0.6 2.1 1.1 6.9 0.4 0.8 0.6 0.8 0.8 0.6 5.5 3.3 1.3 1.2 0.9 1 0.3 0.8 0.6 1.1 0.6 0.6 1.8 0.3 2.8-0.3 14.7-4.6 3.9-0.2 8.1 1.3-2.5 3.3-0.8 4.9 0.2 11.7 1.5 5.6 0 1.2-0.4 1.3-1.4 1.7-1.1 0.9-1 0.8-1.6 0.9-0.7 0.6-0.6 1.5-0.3 2.5 0.2 9.9 1.1 6.8 0.3 1 0.5 0.9 3.5 5.6 0.4 0.9 0.4 1 0.1 0.9-4.8 27.8 0.1 1.6 0.6 2.2-0.3 2.4-4.9 16.1-0.8 0.9-1.8 0.5-1.2 0-1.3-0.3-3.9-1.4-3.2-1.9-3.1-2.3-0.8-0.3-1 3.8-0.5 2.9-2.1 30.2 0 0.1-2.6-0.5-2.5 0-2.8 1.1-23-26.8-1-0.4-1-0.2-1.2-0.1-10.2 1.6-0.9-0.2-0.7-0.8-0.1-1.9 0.2-1.2 0.4-1.3 2.8-5.1-0.2-1.1-0.9-1.2-2.5-1.3-1.4-1.2-0.9-1.4 0-5.7-0.2-1.1-0.3-1.2-0.7-1.1-1.2-1.4-1.6-0.2-1.2 0.1-3.5 1.9-1.9 0.8-1.1 0.3-1 0-1.1-0.1-0.9-0.4-0.8-0.5-1.5-1.2-0.8-0.5-0.9-0.4-1.1-0.1-0.9 0.1-1.1-0.8-1.6-1.4-3.3-4-1.9-1.6-1.7-1-7.4-0.8-2-0.5-2.8-1.3-0.8-0.5-0.7-0.5-2.6-3.4-3.8-6.1-2-4.1-2-6.9-0.6-3-0.2-2.3 0.1-2.5-0.2-1.2-0.6-1-1.5-0.5-1.8 0.7-0.6-0.1-0.6-0.4-0.4-1.2-1.2-7.1-0.1-2.5-0.6-5.2-0.1-1.1 0.1-1.2 0.3-1 0.6-0.7 0.7-0.2 0.6 0.2 0.4 0.4 0.5 0.6 0.6 0.5 0.7 0 0.5-0.6 0.4-1 0.2-2.4-0.1-2.3 0.1-1.2 0.3-1 0.5-0.9 0.6-0.7 2-1.9 0.1-0.1 0.5-1 0.1-0.8-0.2-1.5-1.5-5.1-0.3-2 0-1.6 0.8-3 0-0.9-0.5-1.5-4.5-9.6-0.3-1-0.2-1.1 0-2.3 0.1-1.2 0.3-1 0.5-0.8 0.6-0.7 0.8-0.5 2.1-0.7 0.8-0.4 0.6-0.7 0.6-0.8 0.3-1 0.2-1-0.2-1.4-0.5-1.6-1.1-2.7-0.7-3.2 0-1.2 0.2-1.1 1.8-5 0-1.1-1.2-1-2.3-0.7-9.2-1.2-2.9-1-3.3-2.3-2.5-2.4-3.2-5-2.3-2.9-4.4-0.3-15.4 1.8-4.3-6.8-11.6-11.6-1-9.1z',
    lx: 753.2, ly: 407.8, area: 'lg',
  },
  'Morazán': {
    path: 'M736.4 228.6l1.5-2.6 2.5-2.8 4.5-1.9 3.3 0.5 2.4-0.5 1.8-5.3-0.6-1-3.4-3.1-0.8-1.4-0.3-7.7 0.1-1.3 3.7-1.4 5.7 0.6 0.9 0.2 9 2 6 0.2 19.6-2.4 9.9 0.6 4.3 3.6 5.5 14.3 5.4 6.6 7 6.3 6.1 7.4 3.1 9.5 17.1-8.5 5.6-1.5 0.9 0.1 1.2 7.6 1.6 6.3 0.7 10.9-1.5 23.5 0.1 1.3 0.2 1 0.5 0.8 1.7 2.2 0.5 0.9 0.4 0.9 0.3 0.9 0.4 2.4-0.2 7.4-1.1 8.9-2.2 10.4-8.6 22.3-0.7 7.3-2.7 4.2-11.6 12.4-8.1-1.3-3.9 0.2-14.7 4.6-2.8 0.3-1.8-0.3-0.6-0.6-0.6-1.1-0.3-0.8-0.9-1-1.3-1.2-5.5-3.3-0.8-0.6-0.6-0.8-0.4-0.8-1.1-6.9-0.6-2.1-1.4-2.6-1.6-2.1-1.3-0.8-1.4-0.5-14.6 1.2-2.1 0.4-1.9 0.8-3 1.8-2.1 0.6-0.6-0.5-0.1-0.6 0.5-0.9 2.2-3 0.4-0.9 0.1-1-0.6-1-0.9-0.9-2.7-1.7-0.8-0.7-0.6-0.7-0.3-0.9-0.3-1.1-0.2-1.1-0.8-1.5-1.4-1.9-3.5-2.6-1.4-1.4-0.7-2.3-1.2-1.9-4.8-4.3-1.9-2.3-1.2-1.8-0.6-9.7 0-1 0.4-0.8 0.7-0.7 12.3-8.9 1.7-1 2.9-1 0.9-0.5 0.7-0.7 0.6-0.7 0.3-1.1 0-1.4-0.7-2.3-1-1.5-0.8-1-14.2-9.7-2.1-1.9-1.4-1.5-0.3-1-0.3-1-0.1-3.8 0.3-2.1 0.2-0.7 0.2-0.7 0.5-0.8 1.1-1.4 0.7-0.6 0.8-0.5 0.6-0.7 0.6-0.8 0.4-0.8 0.4-1 0.2-1.1 0-2.3-1.2-3.2-1.5-2.9-0.6-1.7-0.1-1.3-0.7-3.1-4.4-10.4-2.1-2.9z',
    lx: 808.4, ly: 292.1, area: 'lg',
  },
  'La Unión': {
    path: 'M836.2 370.7l11.6-12.4 2.7-4.2 0.7-7.3 8.6-22.3 2.2-10.4 1.1-8.9 0.2-7.4-0.4-2.4-0.3-0.9-0.4-0.9-0.5-0.9-1.7-2.2-0.5-0.8-0.2-1-0.1-1.3 1.5-23.5-0.7-10.9-1.6-6.3-1.2-7.6 2.1 0.5 5.5 3.6 2.6 0.7 1.7-0.8 4.8-3.8 3-1 3.7 0.2 7.4 1.6 3.6-0.3 3.6-2.6 3.1-3.9 3.8-3.2 5.6-0.2 3.6 2.8 3.6 10.2 3.1 4.6 1.9 1.1 5.3 2.1 2.3 1.2 5.9 5.2 10.6 9.1 6.6 2.7-3.3 5.6-7.6 17.6-1.9 6.3 2.4 6.4-1.8 4.1-3.8 3.6-3.3 4.7-1.3 6.9 0.3 14.3-0.9 7-9 21.9-2.2 10.6 4 8.8 3.8 1.4 8-2.6 5.4 2.1 2.9 3.4 2 4.6 0.6 5.2-0.9 4.9-6.4 7.4-29.6 13.6-0.3-0.1-2.9-1.8-1.9-3.1-2.8-8.3-10.6 18.4-2.7 10.8 6.9 4.8 4.4 1.7 12.4 12 7.1 4.8 0.6 2.2 0 4.7-3 8.2-7.5 5.9-27.9 14.1-7.6 6.1-1.3 6.1 8.7 6-13.3 3.1-51.7-3.6-9.6-1.8 0-0.1 2.1-30.2 0.5-2.9 1-3.8 0.8 0.3 3.1 2.3 3.2 1.9 3.9 1.4 1.3 0.3 1.2 0 1.8-0.5 0.8-0.9 4.9-16.1 0.3-2.4-0.6-2.2-0.1-1.6 4.8-27.8-0.1-0.9-0.4-1-0.4-0.9-3.5-5.6-0.5-0.9-0.3-1-1.1-6.8-0.2-9.9 0.3-2.5 0.6-1.5 0.7-0.6 1.6-0.9 1-0.8 1.1-0.9 1.4-1.7 0.4-1.3 0-1.2-1.5-5.6-0.2-11.7 0.8-4.9 2.5-3.3z M942.1 507l-0.3-4.9 2.7-2 5.2 1.7 3.2 7.1 0.2 5.9 1.4 3.9-3.1 1.8-4.9-1.8-3.2 1.5 0-4.2-2-4.1 0.8-4.9z M927.3 487.8l2.9 1.8 2.5 5.6-2.2 3.2-2.5 2.4-4.9-4.4-1.2-6.1 2.2-2.2 3.2-0.3z',
    lx: 879.7, ly: 380.1, area: 'lg',
  },
}

// ─── Normalización ─────────────────────────────────────────────────────────────
function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}
const DEPT_MAP: Record<string, string> = {}
Object.keys(DEPTS).forEach(k => { DEPT_MAP[norm(k)] = k })
function matchDept(raw: string): string | null {
  const n = norm(raw)
  if (DEPT_MAP[n]) return DEPT_MAP[n]
  for (const [key, val] of Object.entries(DEPT_MAP)) {
    if (key.includes(n) || n.includes(key)) return val
  }
  return null
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type DeptStatus = 'arriba' | 'abajo' | 'sin_base' | 'sin_datos'
interface DeptData {
  ytdActual: number
  ytdAnterior: number
  variacion_pct: number | null
  status: DeptStatus
}

// ─── Colores escala de calor ──────────────────────────────────────────────────
function heatColor(d: DeptData | undefined, hovered: boolean): string {
  if (!d || d.ytdActual === 0) return hovered ? 'rgba(113,113,122,0.4)' : 'rgba(63,63,70,0.3)'
  if (d.status === 'sin_base') return hovered ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.4)'
  const pct = Math.abs(d.variacion_pct ?? 0)
  const intensity = Math.min(pct / 80, 1)
  if (d.status === 'arriba') return `rgba(16,185,129,${0.3 + intensity * 0.6})`
  return `rgba(239,68,68,${0.3 + intensity * 0.6})`
}
function strokeColor(d: DeptData | undefined, hovered: boolean): string {
  if (hovered) return d?.status === 'arriba' ? '#10b981' : d?.status === 'abajo' ? '#ef4444' : 'rgba(255,255,255,0.6)'
  return 'rgba(255,255,255,0.15)'
}

// ─── Renderizador de análisis IA estructurado ───────────────────────────────
function AiStructuredText({ text }: { text: string }) {
  if (!text) return null

  const sections = text.split('\n\n').filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sections.map((section, i) => {
        const lines = section.split('\n').filter(Boolean)
        const header = lines[0]
        const bullets = lines.slice(1)

        // Línea de RESUMEN (📊)
        if (header.includes('RESUMEN')) {
          return (
            <p key={i} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--sf-t1)', margin: 0, lineHeight: 1.5 }}>
              {header}
            </p>
          )
        }

        // Línea de HALLAZGO (💡) o ACCIÓN (⚡) legacy
        if (header.includes('HALLAZGO') || header.includes('ACCIÓN') || header.includes('ACCION')) {
          return (
            <p key={i} style={{ fontSize: '12px', fontWeight: 600, color: '#fbbf24', margin: 0, lineHeight: 1.5 }}>
              {header}
            </p>
          )
        }

        // Sección con bullets (🔺 CRECIMIENTO / 🔻 CAÍDA)
        if (bullets.length > 0) {
          const isGrowth = header.includes('CRECIMIENTO') || header.includes('🔺')
          const isFall = header.includes('CAÍDA') || header.includes('CAIDA') || header.includes('🔻')
          const accentColor = isGrowth ? '#34d399' : isFall ? '#f87171' : '#94a3b8'
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: accentColor, margin: 0 }}>
                {header}
              </p>
              {bullets.map((b, j) => (
                <p key={j} style={{ fontSize: '12px', color: 'var(--sf-t2)', margin: 0, paddingLeft: '14px', lineHeight: 1.6 }}>
                  {b}
                </p>
              ))}
            </div>
          )
        }

        // Fallback — línea simple
        return (
          <p key={i} style={{ fontSize: '12px', color: 'var(--sf-t4)', margin: 0, lineHeight: 1.6 }}>
            {header}
          </p>
        )
      })}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DepartamentosPage() {
  const sales = useAppStore(s => s.sales)
  const { year, month } = useAppStore(s => s.selectedPeriod)
  const configuracion = useAppStore(s => s.configuracion)


  const [hovered, setHovered] = useState<string | null>(null)
  const navigate = useNavigate()
  const [insightDept, setInsightDept] = useState<string | null>(null)
  const [insightText, setInsightText] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [aiExplanation, setAiExplanation] = useState<{
    depto: string
    varPct: number
    loading: boolean
    text: string | null
  } | null>(null)
  const aiPanelRef = useRef<HTMLDivElement>(null)

  // ── YTD acumulado desde enero hasta mes seleccionado ─────────────────────────
  const deptData = useMemo((): Record<string, DeptData> => {
    if (!sales.length) return {}
    const ytdActual: Record<string, number> = {}
    const ytdAnterior: Record<string, number> = {}

    for (const s of sales) {
      if (!s.departamento) continue
      const dept = matchDept(s.departamento)
      if (!dept) continue
      const d = new Date(s.fecha)
      const y = d.getFullYear(), m = d.getMonth()
      if (y === year && m <= month)       ytdActual[dept]   = (ytdActual[dept]   ?? 0) + s.unidades
      if (y === year - 1 && m <= month)   ytdAnterior[dept] = (ytdAnterior[dept] ?? 0) + s.unidades
    }

    const res: Record<string, DeptData> = {}
    const all = new Set([...Object.keys(ytdActual), ...Object.keys(ytdAnterior)])
    all.forEach(dept => {
      const a = ytdActual[dept] ?? 0, b = ytdAnterior[dept] ?? 0
      const v = b > 0 ? Math.round(((a - b) / b) * 100) : null
      res[dept] = {
        ytdActual: a, ytdAnterior: b, variacion_pct: v,
        status: a === 0 ? 'sin_datos' : v === null ? 'sin_base' : v >= 0 ? 'arriba' : 'abajo',
      }
    })
    return res
  }, [sales, year, month])

  const sorted = useMemo(() =>
    (Object.entries(deptData) as [string, DeptData][])
      .filter(([, d]) => d.ytdActual > 0)
      .sort(([, a], [, b]) => b.ytdActual - a.ytdActual),
  [deptData])

  const total = sorted.reduce((s, [, d]) => s + d.ytdActual, 0)
  const totalAnterior = sorted.reduce((s, [, d]) => s + d.ytdAnterior, 0)
  const totalVar = totalAnterior > 0 ? Math.round(((total - totalAnterior) / totalAnterior) * 100) : null

  const sobreAnterior = sorted.filter(([, d]) => d.status === 'arriba').length
  const bajoAnterior = sorted.filter(([, d]) => d.status === 'abajo').length
  const maxV = sorted.length > 0 ? sorted[0].ytdActual : 1

  const hasDeptData = sales.some(s => s.departamento)
  const hovData = hovered ? deptData[hovered] : null

  const onEnter = useCallback((k: string) => setHovered(k), [])
  const onLeave = useCallback(() => setHovered(null), [])

  const mesLabel = new Date(year, month).toLocaleDateString('es', { month: 'long' })

  // ── Insight IA ───────────────────────────────────────────────────────────────
  const generateInsight = useCallback(async (dept: string) => {
    const data = deptData[dept]
    if (!data) return

    setInsightDept(dept)
    setInsightText('')
    setInsightLoading(true)

    // Vendedores con comparación YoY
    const vendorMap: Record<string, { curr: number; prev: number }> = {}
    sales.filter(s => s.departamento && matchDept(s.departamento) === dept).forEach(s => {
      const vy = new Date(s.fecha).getFullYear()
      const vm = new Date(s.fecha).getMonth()
      if (vm > month) return
      const isCurr = vy === year
      const isPrev = vy === year - 1
      if (!isCurr && !isPrev) return
      if (!vendorMap[s.vendedor]) vendorMap[s.vendedor] = { curr: 0, prev: 0 }
      if (isCurr) vendorMap[s.vendedor].curr += s.unidades
      if (isPrev) vendorMap[s.vendedor].prev += s.unidades
    })
    const topVendors = Object.entries(vendorMap)
      .sort((a, b) => b[1].curr - a[1].curr)
      .slice(0, 5)
      .map(([nombre, v]) => {
        const vp = v.prev > 0 ? ((v.curr - v.prev) / v.prev * 100).toFixed(1) : 'N/A'
        return `- ${nombre}: ${v.curr.toLocaleString()} uds (${vp}%)`
      }).join('\n')

    // Canales con comparación YoY
    const canalMap: Record<string, { curr: number; prev: number }> = {}
    sales.filter(s => s.departamento && matchDept(s.departamento) === dept && s.canal).forEach(s => {
      const vy = new Date(s.fecha).getFullYear()
      const vm = new Date(s.fecha).getMonth()
      if (vm > month) return
      const isCurr = vy === year
      const isPrev = vy === year - 1
      if (!isCurr && !isPrev) return
      if (!canalMap[s.canal!]) canalMap[s.canal!] = { curr: 0, prev: 0 }
      if (isCurr) canalMap[s.canal!].curr += s.unidades
      if (isPrev) canalMap[s.canal!].prev += s.unidades
    })
    const canalLines = Object.entries(canalMap)
      .map(([canal, v]) => {
        const vp = v.prev > 0 ? ((v.curr - v.prev) / v.prev * 100).toFixed(1) : 'N/A'
        return `- ${canal}: ${v.curr.toLocaleString()} uds (${vp}%)`
      }).join('\n')

    const variacionStr = data.variacion_pct !== null
      ? (data.variacion_pct > 0 ? '+' : '') + data.variacion_pct + '%'
      : 'sin referencia'

    const userPrompt =
      `Departamento: ${dept}\n` +
      `Ventas YTD ${year}: ${data.ytdActual.toLocaleString()} uds\n` +
      `Ventas YTD ${year - 1}: ${data.ytdAnterior.toLocaleString()} uds\n` +
      `Variación: ${variacionStr}\n\n` +
      `Top vendedores:\n${topVendors || '- Sin datos'}\n\n` +
      `Canales:\n${canalLines || '- Sin datos de canal'}`

    const systemPrompt =
      `Eres un analista comercial de una distribuidora en El Salvador.\n` +
      `Responde SIEMPRE en este formato exacto, sin introducción ni cierre:\n\n` +
      `📊 RESUMEN: [Una oración de máximo 15 palabras con el hallazgo principal]\n\n` +
      `🔺 CRECIMIENTO:\n- [Bullet con dato específico: canal, vendedor, o producto que creció y cuánto]\n- [Bullet 2 si aplica — máximo 2 bullets]\n\n` +
      `🔻 CAÍDA:\n- [Bullet con dato específico: canal, vendedor, o producto que cayó y cuánto]\n- [Bullet 2 si aplica — máximo 2 bullets]\n\n` +
      `💡 HALLAZGO: [Un dato concreto que encontraste en los números y que el usuario probablemente no ha visto — con números específicos]\n\n` +
      `Reglas:\n` +
      `- Máximo 120 palabras en total\n` +
      `- Cada bullet debe tener un número concreto (%, unidades, o nombre)\n` +
      `- Si una sección no aplica (ej: todo crece), omítela\n` +
      `- La sección HALLAZGO debe ser una OBSERVACIÓN basada en los datos, no una pregunta ni una instrucción\n` +
      `- Debe revelar algo no obvio: una concentración, una dependencia, una anomalía, un patrón\n` +
      `- NUNCA hagas preguntas al usuario\n` +
      `- NUNCA des instrucciones operativas (capacitar, implementar, diseñar, visitar, revisar)\n` +
      `- Responde en español`

    try {
      const json = await callAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 300, temperature: 0.3 },
      )
      setInsightText(json.choices?.[0]?.message?.content ?? 'Sin respuesta')
    } catch (err) {
      setInsightText(`Error: ${err instanceof Error ? err.message : 'Error al conectar con el asistente.'}`)
    } finally {
      setInsightLoading(false)
    }
  }, [deptData, sales, year, month, mesLabel])

  // ── Click en mapa — panel IA para caídas ──────────────────────────────────
  const handleDeptoClick = useCallback(async (deptKey: string, data: DeptData) => {
    if (!data || data.variacion_pct === null) {
      setAiExplanation(null)
      return
    }

    setAiExplanation({ depto: deptKey, varPct: data.variacion_pct, loading: true, text: null })
    setTimeout(() => aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)

    const ventasDepto = sales.filter(v =>
      v.departamento && matchDept(v.departamento) === deptKey
    )

    // Top vendors in this depto
    const vendorMap: Record<string, { curr: number; prev: number }> = {}
    ventasDepto.forEach(v => {
      const vy = new Date(v.fecha).getFullYear()
      const vm = new Date(v.fecha).getMonth()
      if (vm > month) return
      const isCurr = vy === year
      const isPrev = vy === year - 1
      if (!isCurr && !isPrev) return
      if (!vendorMap[v.vendedor]) vendorMap[v.vendedor] = { curr: 0, prev: 0 }
      if (isCurr) vendorMap[v.vendedor].curr += v.unidades
      if (isPrev) vendorMap[v.vendedor].prev += v.unidades
    })
    const topVendors = Object.entries(vendorMap)
      .sort((a, b) => b[1].curr - a[1].curr)
      .slice(0, 5)
      .map(([nombre, vals]) => ({
        nombre,
        curr: vals.curr,
        prev: vals.prev,
        varPct: vals.prev > 0 ? ((vals.curr - vals.prev) / vals.prev * 100).toFixed(1) : 'N/A',
      }))

    // Canal breakdown
    const canalMap: Record<string, { curr: number; prev: number }> = {}
    ventasDepto.forEach(v => {
      if (!v.canal) return
      const vy = new Date(v.fecha).getFullYear()
      const vm = new Date(v.fecha).getMonth()
      if (vm > month) return
      const isCurr = vy === year
      const isPrev = vy === year - 1
      if (!isCurr && !isPrev) return
      if (!canalMap[v.canal]) canalMap[v.canal] = { curr: 0, prev: 0 }
      if (isCurr) canalMap[v.canal].curr += v.unidades
      if (isPrev) canalMap[v.canal].prev += v.unidades
    })

    const canalLines = Object.entries(canalMap).map(([canal, vals]) => {
      const vp = vals.prev > 0 ? ((vals.curr - vals.prev) / vals.prev * 100).toFixed(1) : 'N/A'
      return `- ${canal}: ${vals.curr.toLocaleString()} uds (antes: ${vals.prev.toLocaleString()}, var: ${vp}%)`
    }).join('\n')

    const sysPrompt =
      `Eres un analista comercial de una distribuidora en El Salvador.\n` +
      `Responde SIEMPRE en este formato exacto, sin introducción ni cierre:\n\n` +
      `📊 RESUMEN: [Una oración de máximo 15 palabras con el hallazgo principal]\n\n` +
      `🔺 CRECIMIENTO:\n- [Bullet con dato específico: canal, vendedor, o producto que creció y cuánto]\n- [Bullet 2 si aplica — máximo 2 bullets]\n\n` +
      `🔻 CAÍDA:\n- [Bullet con dato específico: canal, vendedor, o producto que cayó y cuánto]\n- [Bullet 2 si aplica — máximo 2 bullets]\n\n` +
      `💡 HALLAZGO: [Un dato concreto que encontraste en los números y que el usuario probablemente no ha visto — con números específicos]\n\n` +
      `Reglas:\n` +
      `- Máximo 120 palabras en total\n` +
      `- Cada bullet debe tener un número concreto (%, unidades, o nombre)\n` +
      `- Si una sección no aplica (ej: todo crece), omítela\n` +
      `- La sección HALLAZGO debe ser una OBSERVACIÓN basada en los datos, no una pregunta ni una instrucción\n` +
      `- Debe revelar algo no obvio: una concentración, una dependencia, una anomalía, un patrón\n` +
      `- NUNCA hagas preguntas al usuario\n` +
      `- NUNCA des instrucciones operativas (capacitar, implementar, diseñar, visitar, revisar)\n` +
      `- Responde en español`

    const userPrompt =
      `Departamento: ${deptKey}\n` +
      `Ventas YTD ${year}: ${data.ytdActual.toLocaleString()} uds\n` +
      `Ventas YTD ${year - 1}: ${data.ytdAnterior.toLocaleString()} uds\n` +
      `Variación: ${data.variacion_pct.toFixed(1)}%\n\n` +
      `Vendedores:\n${topVendors.map(v => `- ${v.nombre}: ${v.curr.toLocaleString()} uds (antes: ${v.prev.toLocaleString()}, var: ${v.varPct}%)`).join('\n') || '- Sin datos'}\n\n` +
      `Canales:\n${canalLines || '- Sin datos de canal'}`

    try {
      const json = await callAI(
        [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 300, temperature: 0.3 },
      )
      const text = json.choices?.[0]?.message?.content ?? 'No se pudo generar el análisis.'
      setAiExplanation({ depto: deptKey, varPct: data.variacion_pct, loading: false, text })
    } catch (err) {
      setAiExplanation({ depto: deptKey, varPct: data.variacion_pct, loading: false, text: `Error: ${err instanceof Error ? err.message : 'Error al conectar con el asistente.'}` })
    }
  }, [sales, year, month])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Ventas por Departamento</h1>
          <p style={{ fontSize: '12px', opacity: 0.4, margin: '3px 0 0' }}>
            YTD {year} · vs {year - 1}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: '#34d399', flexShrink: 0 }} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#34d399' }}>{sobreAnterior}</span>
            <span style={{ color: '#94a3b8' }}>sobre año anterior</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: '#f87171', flexShrink: 0 }} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#f87171' }}>{bajoAnterior}</span>
            <span style={{ color: '#94a3b8' }}>bajo año anterior</span>
          </span>
        </div>
      </div>

      {!hasDeptData ? (
        /* ── Estado vacío ── */
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--sf-border)] bg-[var(--sf-card)] text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--sf-inset)] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[var(--sf-t5)]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--sf-t1)]">Sin datos de departamento</p>
            <p className="text-sm text-[var(--sf-t5)] mt-1 max-w-sm">
              Agrega una columna <span className="font-mono bg-[var(--sf-inset)] px-1.5 py-0.5 rounded text-xs text-[var(--sf-t2)]">departamento</span> en tu archivo de ventas para ver el mapa de calor.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Panel IA — departamento seleccionado ── */}
          {aiExplanation && (
            <div ref={aiPanelRef} style={{
              background: 'var(--sf-card)',
              border: '1px solid var(--sf-border)',
              borderLeft: `3px solid ${aiExplanation.varPct < 0 ? '#E24B4A' : '#1D9E75'}`,
              borderRadius: '12px',
              padding: '14px 20px',
              marginBottom: '12px',
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.4, marginBottom: '6px' }}>
                  Análisis IA — {aiExplanation.depto}
                </div>
                {aiExplanation.loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', opacity: 0.5 }}>
                    <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>✦</span>
                    Analizando datos del departamento...
                  </div>
                ) : (
                  <AiStructuredText text={aiExplanation.text ?? ''} />
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const fullContext = [
                      `Profundizar sobre departamento: ${aiExplanation.depto}`,
                      aiExplanation.text ? `\nAnálisis previo:\n${aiExplanation.text}` : '',
                      ``,
                      `Con base en este análisis, profundiza: ¿qué vendedores explican el resultado, hay migración de canal, qué productos están cayendo en este departamento?`
                    ].filter(Boolean).join('\n')
                    if (fullContext.length > 600) {
                      navigate('/chat', { state: { prefill: fullContext } })
                    } else {
                      navigate('/chat?q=' + encodeURIComponent(fullContext))
                    }
                  }}
                  style={{
                    background: 'rgba(29,158,117,0.12)', border: '1px solid rgba(29,158,117,0.35)',
                    borderRadius: '8px', padding: '5px 12px', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 500, color: '#1D9E75',
                  }}
                >
                  ✦ Profundizar
                </button>
                <button
                  onClick={() => setAiExplanation(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.3, fontSize: '16px', color: 'inherit' }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '12px', alignItems: 'start' }}>

            {/* ── Panel del mapa ── */}
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sf-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35 }}>
                  Mapa de calor · El Salvador
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { color: '#1D9E75',               label: 'Sobre anterior' },
                    { color: '#E24B4A',               label: 'Bajo anterior' },
                    { color: 'rgba(255,255,255,0.2)', label: 'Sin datos' },
                  ].map(({ color, label }) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', opacity: 0.6 }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ padding: '12px' }}>
                <svg viewBox="0 0 1000 547" className="w-full h-auto" style={{ maxHeight: 480 }}>
                  <defs>
                    <filter id="dept-glow" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="0" stdDeviation="4" floodOpacity="0.5" />
                    </filter>
                  </defs>
                  {Object.entries(DEPTS).map(([key, dept]) => {
                    const data = deptData[key]
                    const isHov = hovered === key
                    return (
                      <g
                        key={key}
                        style={{ filter: isHov ? 'url(#dept-glow)' : 'none', cursor: 'pointer' }}
                        onMouseEnter={() => onEnter(key)}
                        onMouseLeave={onLeave}
                        onClick={() => data && handleDeptoClick(key, data)}
                      >
                        <path
                          d={dept.path}
                          fill={heatColor(data, isHov)}
                          stroke={strokeColor(data, isHov)}
                          strokeWidth={isHov ? 1.5 : 0.75}
                          style={{ transition: 'fill 0.18s ease, stroke 0.12s ease' }}
                        />
                        <text
                          x={dept.lx} y={dept.ly - (data?.variacion_pct != null ? 6 : 0)}
                          textAnchor="middle"
                          style={{
                            fontSize: dept.area === 'lg' ? '8.5px' : '7.5px',
                            fontFamily: 'system-ui, sans-serif',
                            fill: isHov ? '#ffffff' : 'rgba(228,228,231,0.9)',
                            fontWeight: isHov ? 700 : 500,
                            pointerEvents: 'none',
                            userSelect: 'none',
                            transition: 'fill 0.15s',
                            paintOrder: 'stroke',
                            stroke: 'rgba(0,0,0,0.5)',
                            strokeWidth: '2px',
                          } as CSSProperties}
                        >
                          {key.split(' ').length > 1
                            ? key.split(' ').map((w, i) => (
                                <tspan key={i} x={dept.lx} dy={i === 0 ? 0 : '1.15em'}>{w}</tspan>
                              ))
                            : key}
                        </text>
                        {data?.variacion_pct != null && (
                          <text
                            x={dept.lx}
                            y={dept.ly + (key.split(' ').length > 1 ? 12 : 7)}
                            textAnchor="middle"
                            style={{
                              fontSize: '7px',
                              fontFamily: 'system-ui, sans-serif',
                              fill: data.status === 'arriba' ? '#34d399' : '#f87171',
                              fontWeight: 700,
                              pointerEvents: 'none',
                              userSelect: 'none',
                              paintOrder: 'stroke',
                              stroke: 'rgba(0,0,0,0.6)',
                              strokeWidth: '2px',
                            } as CSSProperties}
                          >
                            {data.variacion_pct > 0 ? '+' : ''}{data.variacion_pct}%
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              </div>

              {/* Info panel en hover */}
              <div style={{ borderTop: '1px solid var(--sf-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '42px' }}>
                {hovered && hovData ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '120px' }}>{hovered}</span>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>{hovData.ytdActual.toLocaleString()} uds</span>
                      {hovData.ytdAnterior > 0 && (
                        <span style={{ fontSize: '12px', opacity: 0.4 }}>{hovData.ytdAnterior.toLocaleString()} uds</span>
                      )}
                      {hovData.variacion_pct != null && (
                        <span style={{ fontSize: '13px', fontWeight: 700, color: hovData.status === 'arriba' ? '#1D9E75' : '#E24B4A' }}>
                          {hovData.variacion_pct > 0 ? '+' : ''}{hovData.variacion_pct}%
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeptoClick(hovered, hovData) }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        color: '#1D9E75', background: 'rgba(29,158,117,0.06)',
                        border: '1px solid rgba(29,158,117,0.15)', cursor: 'pointer',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.14)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.35)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.06)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.15)' }}
                    >
                      ✦ IA
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', opacity: 0.35, fontStyle: 'italic' }}>Selecciona un departamento en el mapa</span>
                )}
              </div>
            </div>

            {/* ── Ranking lateral ── */}
            <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'visible' }}>
              {sorted.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', opacity: 0.4 }}>Sin datos para este período</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '72px' }} />
                    <col style={{ width: '100px' }} />
                  </colgroup>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                    <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                      <th style={{ padding: '10px 16px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'left', borderLeft: '2px solid #1D9E75' }}>Departamento</th>
                      <th style={{ padding: '10px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'right' }}>{year}</th>
                      <th style={{ padding: '10px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'right' }}>{year - 1}</th>
                      <th style={{ padding: '10px 12px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, fontWeight: 400, textAlign: 'right' }}>Var.</th>
                      <th style={{ padding: '10px 8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(([dept, data], i) => {
                      const relativeWidth = (data.ytdActual / maxV) * 100
                      const varPct = data.variacion_pct
                      return (
                        <tr
                          key={dept}
                          style={{
                            borderBottom: '1px solid var(--sf-border)',
                            cursor: 'pointer',
                            transition: 'all 150ms',
                            ...(hovered === dept
                              ? { background: 'rgba(56,189,248,0.04)', boxShadow: 'inset 3px 0 0 #38bdf8' }
                              : {}),
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = hovered === dept ? 'rgba(56,189,248,0.04)' : 'var(--sf-hover)'; onEnter(dept); setHoveredRow(dept) }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; onLeave(); setHoveredRow(null) }}
                        >
                          <td style={{ padding: '9px 16px', borderLeft: '2px solid rgba(29,158,117,0.15)' }}>
                            <span style={{
                              width: '24px', height: '24px', borderRadius: '6px',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontFamily: 'ui-monospace, monospace', fontWeight: i < 3 ? 700 : 500,
                              marginBottom: '2px',
                              ...(i === 0
                                ? { background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#451a03' }
                                : i === 1
                                ? { background: 'linear-gradient(135deg, #cbd5e1, #64748b)', color: '#0f172a' }
                                : i === 2
                                ? { background: 'linear-gradient(135deg, #f97316, #c2410c)', color: '#431407' }
                                : { background: 'var(--sf-inset)', color: 'var(--sf-t5)' }),
                            }}>
                              {i + 1}
                            </span>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{dept}</div>
                            <div style={{ width: '85%', height: '4px', background: 'var(--sf-inset)', borderRadius: '9999px', marginTop: '6px' }}>
                              <div style={{
                                width: `${relativeWidth}%`,
                                height: '100%',
                                borderRadius: '9999px',
                                transition: 'all 500ms',
                                background: varPct != null && varPct >= 0
                                  ? 'linear-gradient(90deg, rgba(52,211,153,0.3), rgba(52,211,153,0.55))'
                                  : 'linear-gradient(90deg, rgba(248,113,113,0.3), rgba(248,113,113,0.55))',
                              }} />
                            </div>
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: '13px', fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{data.ytdActual.toLocaleString()}</td>
                          <td style={{ padding: '9px 12px', fontSize: '12px', opacity: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {data.ytdAnterior > 0 ? data.ytdAnterior.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                            {varPct != null ? (
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontFamily: 'ui-monospace, monospace',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                background: varPct >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                color: varPct >= 0 ? '#34d399' : '#f87171',
                              }}>
                                {varPct > 0 ? '+' : ''}{varPct}%
                              </span>
                            ) : (
                              <span style={{ fontSize: '12px', opacity: 0.3 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                            {varPct != null && (
                              aiExplanation?.depto === dept && aiExplanation.loading ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--sf-t4)] whitespace-nowrap" style={{ padding: '5px 12px' }}>
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  Analizando…
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeptoClick(dept, data) }}
                                  title="Analizar con IA"
                                  style={{
                                    background: 'rgba(29,158,117,0.08)',
                                    border: '1px solid rgba(29,158,117,0.25)',
                                    borderRadius: '8px',
                                    padding: '5px 12px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: '#1D9E75',
                                    transition: 'all 150ms',
                                    lineHeight: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.18)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.45)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(29,158,117,0.08)'; e.currentTarget.style.borderColor = 'rgba(29,158,117,0.25)' }}
                                >
                                  <span style={{ fontSize: '13px' }}>✦</span>
                                  Analizar
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '1px solid var(--sf-border)', background: 'rgba(29,158,117,0.06)' }}>
                      <td style={{ padding: '11px 16px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', color: '#1D9E75', borderLeft: '2px solid #1D9E75' }}>TOTAL</td>
                      <td style={{ padding: '11px 12px', fontSize: '13px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</td>
                      <td style={{ padding: '11px 12px', fontSize: '12px', opacity: 0.4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {totalAnterior > 0 ? totalAnterior.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '11px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: totalVar != null ? (totalVar >= 0 ? '#1D9E75' : '#E24B4A') : 'rgba(255,255,255,0.3)' }}>
                        {totalVar != null ? `${totalVar >= 0 ? '+' : ''}${totalVar}%` : '—'}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>


          {/* ── Caja Insight IA ── */}
          {insightDept && (
            <div style={{ marginTop: '12px', background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sf-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[#00D68F] text-sm">✦</span>
                  <p className="text-[13px] font-semibold text-[var(--sf-t1)]">
                    Insight IA — {insightDept}
                  </p>
                </div>
                <button
                  onClick={() => { setInsightDept(null); setInsightText('') }}
                  className="text-[var(--sf-t5)] hover:text-[var(--sf-t4)] transition-colors text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4">
                {insightLoading ? (
                  <p className="text-[13px] text-[var(--sf-t5)] italic">Analizando {insightDept}...</p>
                ) : (
                  <>
                    <AiStructuredText text={insightText} />
                    <div className="mt-4 pt-3.5 border-t border-[var(--sf-border)] flex justify-end">
                      <button
                        onClick={() => {
                          const fullContext = [
                            `Profundizar sobre departamento: ${insightDept}`,
                            `Ventas YTD ${year}: ${deptData[insightDept]?.ytdActual ?? 0} uds`,
                            insightText ? `\nAnálisis previo:\n${insightText}` : '',
                            ``,
                            `Con base en este análisis, profundiza: ¿qué vendedores explican el resultado, hay migración de canal, qué productos están cayendo en este departamento?`
                          ].filter(Boolean).join('\n')
                          if (fullContext.length > 600) {
                            navigate('/chat', { state: { prefill: fullContext } })
                          } else {
                            navigate('/chat?q=' + encodeURIComponent(fullContext))
                          }
                        }}
                        className="text-[12px] text-[var(--sf-t5)] hover:text-[var(--sf-t2)] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        Profundizar en Chat IA →
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
