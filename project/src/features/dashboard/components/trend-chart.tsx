"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { registrationTrend } from "@/mocks";

const config = {
  mcp: { label: "CLI 수집", color: "var(--chart-1)" },
  web: { label: "웹 등록", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function TrendChart() {
  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <AreaChart data={registrationTrend} margin={{ left: -20, right: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Area
          dataKey="mcp"
          type="monotone"
          stackId="a"
          stroke="var(--color-mcp)"
          fill="var(--color-mcp)"
          fillOpacity={0.3}
        />
        <Area
          dataKey="web"
          type="monotone"
          stackId="a"
          stroke="var(--color-web)"
          fill="var(--color-web)"
          fillOpacity={0.3}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}
