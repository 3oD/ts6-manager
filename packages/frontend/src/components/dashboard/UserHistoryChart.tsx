import { useState } from 'react';
import { format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { History, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserHistory } from '@/hooks/use-dashboard';
import type { HistoryRange } from '@/api/dashboard.api';
import { cn } from '@/lib/utils';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
];

const STROKE = 'hsl(186, 72%, 42%)';
const AXIS_TICK = { fontSize: 10, fill: 'hsl(215, 16%, 50%)' };

export function UserHistoryChart() {
  const [range, setRange] = useState<HistoryRange>('24h');
  const { data, isLoading, isError } = useUserHistory(range);

  const shortRange = range === '6h' || range === '24h';
  const tickFormat = shortRange ? 'HH:mm' : range === '7d' ? 'EEE HH:mm' : 'dd.MM.';
  const tooltipFormat = shortRange ? 'dd.MM. HH:mm' : 'dd.MM.yyyy HH:mm';
  const aggregated = (data?.bucketMinutes ?? 0) > (data?.sampleIntervalMinutes ?? 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Online Users History
          </CardTitle>
          <div className="flex rounded-md border border-border overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-mono-data transition-colors',
                  range === r.value
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          {isLoading ? (
            <Placeholder text="Loading history..." />
          ) : isError || !data ? (
            <Placeholder text="Could not load history" />
          ) : data.sampleCount === 0 ? (
            <Placeholder
              text={`No data yet — online users are recorded every ${data.sampleIntervalMinutes} min`}
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.points}>
                <defs>
                  <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={STROKE} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={STROKE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(215, 22%, 14%)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(t) => format(t, tickFormat)}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  allowDecimals={false}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <ReTooltip
                  contentStyle={{ background: 'hsl(218, 28%, 10%)', border: '1px solid hsl(215, 22%, 14%)', borderRadius: '6px', fontSize: '12px' }}
                  labelStyle={{ color: 'hsl(213, 20%, 85%)' }}
                  labelFormatter={(t) => format(Number(t), tooltipFormat)}
                  formatter={(value: number, name: string) => [
                    value,
                    name === 'max' ? (aggregated ? 'Peak users' : 'Users') : 'Average',
                  ]}
                />
                {/* For aggregated ranges show the peak per bucket as the main line, average as a faint line */}
                <Area
                  type="monotone"
                  dataKey="max"
                  stroke={STROKE}
                  fill="url(#usersGrad)"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {aggregated && (
                  <Area
                    type="monotone"
                    dataKey="avg"
                    stroke="hsl(280, 55%, 60%)"
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        {data && data.sampleCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">Peak:</span>
              <span className="font-mono-data text-primary">{data.peak?.clients ?? 0}</span>
              {data.peak && (
                <span className="text-muted-foreground font-mono-data">
                  ({format(new Date(data.peak.timestamp), 'dd.MM. HH:mm')})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-muted-foreground">Average:</span>
              <span className="font-mono-data text-violet-400">{data.average ?? 0}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground font-mono-data text-center px-4">
      {text}
    </div>
  );
}
