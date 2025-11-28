import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { PriceHistoryPoint } from '../api/client';

interface PriceChartProps {
  data: PriceHistoryPoint[];
}

export default function PriceChart({ data }: PriceChartProps) {
  // Format data for chart
  const chartData = data.map(point => ({
    time: new Date(point.created_at).getTime(),
    yes: Math.round(point.yes_price * 100),
    no: Math.round(point.no_price * 100),
    date: new Date(point.created_at).toLocaleDateString(),
    fullTime: new Date(point.created_at).toLocaleString()
  }));

  if (chartData.length === 0) {
    return <div className="empty-chart">Not enough data to display chart</div>;
  }

  return (
    <div className="chart-container" style={{ height: 300, width: '100%', marginTop: '2rem', marginBottom: '2rem' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis 
            dataKey="time" 
            type="number"
            domain={['dataMin', 'dataMax']} 
            tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            stroke="#888"
            fontSize={12}
            tickMargin={10}
          />
          <YAxis 
            domain={[0, 100]} 
            stroke="#888"
            fontSize={12}
            unit="%"
            width={40}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#121212', border: '1px solid #333' }}
            itemStyle={{ color: '#fff' }}
            labelFormatter={(label) => new Date(label).toLocaleString()}
            formatter={(value: number) => [`${value}%`, '']}
          />
          <Line 
            type="monotone" 
            dataKey="yes" 
            name="Yes" 
            stroke="#00D66C" 
            strokeWidth={2} 
            dot={false} 
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Line 
            type="monotone" 
            dataKey="no" 
            name="No" 
            stroke="#888" 
            strokeWidth={2} 
            dot={false} 
            hide={true} // Hide "No" line by default to keep it clean like Kalshi
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
