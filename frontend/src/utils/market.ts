import type { Line } from '../api/client';

export function isMarketOpen(line: Line, now: Date = new Date()): boolean {
  return !line.resolved && new Date(line.closes_at) > now;
}

export function getMarketStatus(line: Line, now: Date = new Date()): 'open' | 'closed' | 'resolved' {
  if (line.resolved) return 'resolved';
  if (new Date(line.closes_at) <= now) return 'closed';
  return 'open';
}
