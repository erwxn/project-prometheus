import { createContext, useContext } from 'react';
import type { DashboardContextValue } from './DashboardProvider';

export const DashboardContext = createContext<DashboardContextValue | null>(null);
export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('Dashboard components require DashboardProvider.');
  return context;
}
