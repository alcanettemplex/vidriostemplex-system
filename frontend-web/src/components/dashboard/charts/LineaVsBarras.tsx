import React from 'react';
import { Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';

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
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e5eb" />
          <XAxis 
            dataKey={xKey} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#3f4858' }}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 11, fill: '#3f4858' }}
            width={65}
          />
          <Tooltip 
            cursor={{ fill: '#f6f7f9' }}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e1e5eb', background: '#ffffff', boxShadow: '0 12px 28px -6px rgba(17,22,32,0.14)', fontSize: 12, color: '#111620' }} labelStyle={{ color: '#111620', fontWeight: 600 }}
            formatter={(value: any, name: any) => {
              const val = typeof value === 'number' ? yAxisFormatter(value) : value;
              return [val, name === barsKey ? 'Real' : 'Meta'];
            }}
          />
          <Bar dataKey={barsKey} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line 
            type="monotone" 
            dataKey={lineKey} 
            stroke="#6f7a8c" 
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
