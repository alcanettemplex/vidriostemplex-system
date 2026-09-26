import React from 'react';
import { motion } from 'framer-motion';

interface KPICardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: string;
    trendUp?: boolean;
    colorClass?: string;
    delay?: number;
}

const KPICard: React.FC<KPICardProps> = ({
    title,
    value,
    icon,
    trend,
    trendUp = true,
    colorClass = "text-blue-600 bg-blue-50",
    delay = 0
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className="glass-panel p-6 flex flex-col relative overflow-hidden group"
        >
            <div className="absolute top-0 right-0 p-4 opacity-50 transform group-hover:scale-110 transition-transform duration-300">
                <div className={`p-3 rounded-2xl ${colorClass}`}>
                    {icon}
                </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-900 mb-1 z-10">{title}</h3>
            <p className="text-3xl font-extrabold text-slate-900 z-10 mb-2 whitespace-nowrap">{value}</p>

            {trend && (
                <div className="flex items-center text-sm z-10 mt-auto">
                    <span className={`flex items-center font-medium ${trendUp ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {trendUp ? '↑' : '↓'} {trend}
                    </span>
                    <span className="text-slate-700 ml-2">vs mes anterior</span>
                </div>
            )}
        </motion.div>
    );
};

export default KPICard;
