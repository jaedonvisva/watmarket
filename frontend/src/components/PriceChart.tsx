import { useState, useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts';
import type { PriceHistoryPoint } from '../api/client';

interface PriceChartProps {
  data: PriceHistoryPoint[];
  currentYesPrice?: number;
}

type TimePeriod = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export default function PriceChart({ data, currentYesPrice }: PriceChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('ALL');
  const [hoveredData, setHoveredData] = useState<{ yes: number; time: number } | null>(null);

  // Filter data based on selected time period
  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    
    const now = new Date();
    let cutoffDate: Date;
    
    switch (period) {
      case '1D':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '1W':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1M':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3M':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6M':
        cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'YTD':
        cutoffDate = new Date(now.getFullYear(), 0, 1);
        break;
      case '1Y':
        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'ALL':
      default:
        cutoffDate = new Date(0);
    }
    
    return data.filter(point => new Date(point.created_at) >= cutoffDate);
  }, [data, period]);

  // Format data for chart
  const chartData = useMemo(() => {
    return filteredData.map(point => ({
      time: new Date(point.created_at).getTime(),
      yes: point.yes_price,
      no: point.no_price,
    }));
  }, [filteredData]);

  // Calculate stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return { current: 0, change: 0, changePercent: 0, isPositive: true };
    
    const current = currentYesPrice !== undefined ? currentYesPrice : chartData[chartData.length - 1].yes;
    const first = chartData[0].yes;
    const change = current - first;
    const changePercent = first !== 0 ? (change / first) * 100 : 0;
    
    return {
      current,
      change,
      changePercent,
      isPositive: change >= 0
    };
  }, [chartData, currentYesPrice]);

  // Use current price when no chart data available for the period
  const displayValue = hoveredData?.yes ?? (chartData.length > 0 ? stats.current : (currentYesPrice !== undefined ? currentYesPrice : 0));
  
  const timePeriods: TimePeriod[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
  
  // Check which periods have data
  const periodsWithData = useMemo(() => {
    const result: Record<TimePeriod, boolean> = {} as Record<TimePeriod, boolean>;
    const now = new Date();
    
    for (const p of timePeriods) {
      let cutoff: Date;
      switch (p) {
        case '1D': cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
        case '1W': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case '1M': cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
        case '3M': cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
        case '6M': cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); break;
        case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
        case '1Y': cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
        case 'ALL': default: cutoff = new Date(0);
      }
      result[p] = data.some(point => new Date(point.created_at) >= cutoff);
    }
    return result;
  }, [data]);

  // If no data at all, show the current price with a message
  if (data.length === 0) {
    const currentValue = currentYesPrice !== undefined ? currentYesPrice : 0.5;
    return (
      <div className="robinhood-chart">
        <div className="chart-header">
          <div className="chart-value-display">
            <div className="chart-value-row">
              <span className="chart-current-value">{(currentValue * 100).toFixed(1)}%</span>
              <span className="chart-outcome-label">Yes</span>
            </div>
            <span className="chart-change neutral">No trading activity yet</span>
          </div>
        </div>
        <div className="chart-area">
          <div className="chart-empty-period">
            <span>Chart will appear after first trade</span>
          </div>
        </div>
        <div className="chart-time-selector">
          {timePeriods.map((p) => (
            <button
              key={p}
              className={`time-btn ${p === 'ALL' ? 'active' : ''} disabled`}
              disabled
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const hasDataForPeriod = chartData.length > 0;

  return (
    <div className="robinhood-chart">
      <div className="chart-header">
        <div className="chart-value-display">
          <div className="chart-value-row">
            <span className="chart-current-value">{(displayValue * 100).toFixed(1)}%</span>
            <span className="chart-outcome-label">Yes</span>
          </div>
          {hasDataForPeriod ? (
            <span className={`chart-change ${stats.isPositive ? 'positive' : 'negative'}`}>
              {stats.isPositive ? '+' : ''}{(stats.change * 100).toFixed(1)}pp ({stats.isPositive ? '+' : ''}{stats.changePercent.toFixed(1)}%) {period !== 'ALL' ? period : 'all time'}
            </span>
          ) : (
            <span className="chart-change neutral">No trading activity {period !== 'ALL' ? `in ${period}` : ''}</span>
          )}
        </div>
      </div>

      <div className="chart-area">
        {hasDataForPeriod ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart 
              data={chartData}
              margin={{ top: 8, right: 8, left: 28, bottom: 0 }}
              onMouseMove={(e) => {
                const payload = (e as unknown as { activePayload?: Array<{ payload: { yes: number; time: number } }> }).activePayload;
                if (payload && payload[0]) {
                  setHoveredData(payload[0].payload);
                }
              }}
              onMouseLeave={() => setHoveredData(null)}
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D66C" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#00D66C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                type="number"
                domain={['dataMin', 'dataMax']} 
                hide={true}
              />
              <YAxis 
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="chart-tooltip">
                        <div className="tooltip-price">{(d.yes * 100).toFixed(2)}%</div>
                        <div className="tooltip-date">
                          {new Date(d.time).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: '#00D66C', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area 
                type="monotone" 
                dataKey="yes" 
                stroke="#00D66C" 
                strokeWidth={2} 
                fill="url(#chartGradient)"
                dot={false}
                activeDot={{ r: 6, fill: '#00D66C', stroke: '#000', strokeWidth: 2 }}
              />
              {chartData.length > 0 && (
                <ReferenceDot
                  x={chartData[chartData.length - 1].time}
                  y={chartData[chartData.length - 1].yes}
                  r={5}
                  fill="#00D66C"
                  stroke="#000"
                  strokeWidth={2}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty-period">
            <span>No data for this time period</span>
          </div>
        )}
      </div>

      <div className="chart-time-selector">
        {timePeriods.map((p) => (
          <button
            key={p}
            className={`time-btn ${period === p ? 'active' : ''} ${!periodsWithData[p] ? 'disabled' : ''}`}
            onClick={() => setPeriod(p)}
            disabled={!periodsWithData[p]}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
