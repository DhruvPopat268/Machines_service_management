import { CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineStep {
  label: string;
  date?: string;
  description?: string;
  completed: boolean;
  active?: boolean;
}

interface StatusTimelineProps {
  steps: TimelineStep[];
}

export function StatusTimeline({ steps }: StatusTimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            {step.completed ? (
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            ) : step.active ? (
              <Clock className="h-5 w-5 text-primary shrink-0 animate-pulse" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
            )}
            {i < steps.length - 1 && (
              <div className={cn("w-0.5 flex-1 min-h-[2rem]", step.completed ? "bg-success/40" : "bg-border")} />
            )}
          </div>
          <div className="pb-6">
            <p className={cn("text-sm font-medium", step.completed ? "text-foreground" : step.active ? "text-primary" : "text-muted-foreground")}>
              {step.label}
            </p>
            {step.date && <p className="text-xs text-muted-foreground">{step.date}</p>}
            {step.description && <p className="text-xs text-muted-foreground mt-1">{step.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
