import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  data: any[];
  nameKey: string;
  dataKey: string;
  colors: string[];
  height?: number;
}

const DonutChart: React.FC<Props> = ({ data, nameKey, dataKey, colors, height = 220 }) => {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={4}
            dataKey={dataKey}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any) => [`${value}%`, 'Porcentaje']}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e1e5eb', background: '#ffffff', boxShadow: '0 12px 28px -6px rgba(17,22,32,0.14)', fontSize: 12, color: '#111620' }} itemStyle={{ color: '#111620' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DonutChart;
