import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: any[];
  dataKeyName: string;
  dataKeyValue: string;
  height?: number;
  color?: string;
  yAxisFormatter?: (val: number) => string;
}

const BarrasVerticales: React.FC<Props> = ({ 
  data, 
  dataKeyName, 
  dataKeyValue, 
  height = 250, 
  color = '#4f46e5',
  yAxisFormatter = (v) => v.toString()
}) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey={dataKeyName} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#64748b' }}
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 11, fill: '#64748b' }}
            width={60}
          />
          <Tooltip 
            cursor={{ fill: '#f8fafc' }}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            formatter={(value: any) => [yAxisFormatter(value as number), 'Cantidad']}
          />
          <Bar dataKey={dataKeyValue} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BarrasVerticales;
