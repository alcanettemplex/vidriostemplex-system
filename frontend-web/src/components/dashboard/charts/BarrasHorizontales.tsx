import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: any[];
  yKey: string;
  barsKey: string;
  xFormatter?: (val: number) => string;
}

const BarrasHorizontales: React.FC<Props> = ({ 
  data, yKey, barsKey, 
  xFormatter = (v) => v.toString()
}) => {
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis 
            type="number"
            tickFormatter={xFormatter}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            dataKey={yKey} 
            type="category" 
            axisLine={false} 
            tickLine={false}
            tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
            width={120} // Espacio para nombres largos ("Ana Rodríguez max")
          />
          <Tooltip 
            cursor={{ fill: '#f8fafc' }}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
            formatter={(value: any) => [xFormatter(value as number), '']}
          />
          <Bar dataKey={barsKey} fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BarrasHorizontales;
