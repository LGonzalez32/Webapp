import { useLocation } from 'react-router-dom'

/** Returns a function that prefixes paths with /demo when in demo mode */
export function useDemoPath() {
  const location = useLocation()
  const isDemo = location.pathname.startsWith('/demo')
  return (path: string) => isDemo ? `/demo${path}` : path
}
