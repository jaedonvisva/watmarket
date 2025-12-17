export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };
  return new Date(dateStr).toLocaleDateString('en-US', options || defaultOptions);
}

export function formatDateWithTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateFull(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPnL(value: number, showSign = true): string {
  const sign = value >= 0 ? '+' : '';
  return showSign ? `${sign}${value.toFixed(0)}` : value.toFixed(0);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString();
}
