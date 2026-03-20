import React from 'react';
import { AreaChart, Area, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';

interface Props {
  data: any[];
  xKey: string;
  barsKey: string;
  lineKey: string;
  yAxisFormatter?: (val: number) => string;
}

const LineaVsBarras: React.FC<Props> = ({ 
  data, xKey, barsKey, lineKey, 
  yAxisFormatter = (v) => v.toString()
}) => {
  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey={xKey} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 11, fill: '#64748b' }}
            width={65}
          />
          <Tooltip 
            cursor={{ fill: '#f8fafc' }}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
            formatter={(value: any, name: any) => {
              const val = typeof value === 'number' ? yAxisFormatter(value) : value;
              return [val, name === barsKey ? 'Real' : 'Meta'];
            }}
          />
          <Bar dataKey={barsKey} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line 
            type="monotone" 
            dataKey={lineKey} 
            stroke="#94a3b8" 
            strokeWidth={2} 
            strokeDasharray="5 5" 
            dot={{ r: 4, strokeWidth: 2 }} 
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LineaVsBarras;
