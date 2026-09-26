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
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e1e5eb" />
          <XAxis 
            dataKey={dataKeyName} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#3f4858' }}
            angle={-45}
            textAnchor="end"
            height={40}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 11, fill: '#3f4858' }}
            width={60}
          />
          <Tooltip 
            cursor={{ fill: '#f6f7f9' }}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e1e5eb', background: '#ffffff', boxShadow: '0 12px 28px -6px rgba(17,22,32,0.14)', fontSize: 12, color: '#111620' }} labelStyle={{ color: '#111620', fontWeight: 600 }}
            formatter={(value: any) => [yAxisFormatter(value as number), 'Cantidad']}
          />
          <Bar dataKey={dataKeyValue} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BarrasVerticales;
