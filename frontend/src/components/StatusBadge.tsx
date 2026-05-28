import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  Pending: "bg-warning/10 text-warning border-warning/20",
  Open: "bg-warning/10 text-warning border-warning/20",
  Assigned: "bg-info/10 text-info border-info/20",
  "Travel Started": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "Reached Location": "bg-violet-500/10 text-violet-600 border-violet-500/20",
  "In Progress": "bg-primary/10 text-primary border-primary/20",
  "On Hold": "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  Resolved: "bg-success/10 text-success border-success/20",
  Active: "bg-success/10 text-success border-success/20",
  Inactive: "bg-muted text-muted-foreground border-border",
  Low: "bg-success/10 text-success border-success/20",
  Medium: "bg-warning/10 text-warning border-warning/20",
  High: "bg-destructive/10 text-destructive border-destructive/20",
  Critical: "bg-destructive/15 text-destructive border-destructive/30",
  "In Stock": "bg-success/10 text-success border-success/20",
  "Low Stock": "bg-warning/10 text-warning border-warning/20",
  "Out of Stock": "bg-destructive/10 text-destructive border-destructive/20",
  "Under Warranty": "bg-info/10 text-info border-info/20",
  Expired: "bg-muted text-muted-foreground border-border",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status] || "bg-muted text-muted-foreground border-border",
        className
      )}
    >
      {status}
    </span>
  );
}
