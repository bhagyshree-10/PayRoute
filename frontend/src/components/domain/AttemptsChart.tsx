import React from 'react';
import { SeriesBucket } from '@payroute/shared';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { cn } from '../../lib/cn.js';

export interface AttemptsChartProps {
  series: SeriesBucket[];
  className?: string;
}

export const AttemptsChart: React.FC<AttemptsChartProps> = ({ series = [], className }) => {
  const chartData = series.map((s) => ({
    time: s.t,
    StripeOK: s.stripe.ok,
    StripeFault: s.stripe.fault,
    RazorpayOK: s.razorpay.ok,
    RazorpayFault: s.razorpay.fault,
  }));

  return (
    <div className={cn('w-full h-[240px]', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D9E2EC" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#52667A"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: '#D9E2EC' }}
          />
          <YAxis
            stroke="#52667A"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: '#D9E2EC' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              borderColor: '#D9E2EC',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#102A43'
            }}
            isAnimationActive={false}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            iconType="square"
          />
          <Bar
            dataKey="StripeOK"
            name="STR (OK)"
            fill="#0070BA"
            stackId="a"
            isAnimationActive={false}
          />
          <Bar
            dataKey="RazorpayOK"
            name="RZP (OK)"
            fill="#00A8E0"
            stackId="a"
            isAnimationActive={false}
          />
          <Bar
            dataKey="StripeFault"
            name="STR (Fault)"
            fill="#DC3545"
            stackId="a"
            isAnimationActive={false}
          />
          <Bar
            dataKey="RazorpayFault"
            name="RZP (Fault)"
            fill="#B02A37"
            stackId="a"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
