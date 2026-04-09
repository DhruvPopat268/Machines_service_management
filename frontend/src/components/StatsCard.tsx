import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  colorClass?: string;
}

export function StatsCard({ label, value, icon: Icon, trend, trendUp, colorClass = "text-primary bg-accent" }: StatsCardProps) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-foreground truncate">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        {trend && (
          <span className={cn("text-xs font-medium", trendUp ? "text-success" : "text-destructive")}>
            {trend}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
