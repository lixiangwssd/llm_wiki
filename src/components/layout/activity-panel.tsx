import { useState } from "react"
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react"
import { useActivityStore, type ActivityItem } from "@/stores/activity-store"

export function ActivityPanel() {
  const items = useActivityStore((s) => s.items)
  const clearDone = useActivityStore((s) => s.clearDone)
  const [expanded, setExpanded] = useState(false)

  const runningCount = items.filter((i) => i.status === "running").length
  const hasItems = items.length > 0

  if (!hasItems) return null

  const latestItem = items[0]

  return (
    <div className="border-t bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50"
      >
        {runningCount > 0 ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        ) : (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
        )}
        <span className="flex-1 truncate text-left">
          {runningCount > 0
            ? `Processing: ${latestItem?.title ?? "..."}`
            : `Done: ${latestItem?.title ?? "All tasks complete"}`}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronUp className="h-3 w-3 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="max-h-48 overflow-y-auto border-t">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
          {items.some((i) => i.status !== "running") && (
            <button
              onClick={clearDone}
              className="w-full px-3 py-1 text-center text-[10px] text-muted-foreground hover:underline"
            >
              Clear completed
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 text-xs">
      <div className="mt-0.5 shrink-0">
        {item.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        {item.status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
        {item.status === "error" && <AlertCircle className="h-3 w-3 text-destructive" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.title}</div>
        <div className="truncate text-muted-foreground">{item.detail}</div>
        {item.filesWritten.length > 0 && item.status === "done" && (
          <div className="mt-0.5 text-muted-foreground">
            {item.filesWritten.length} file{item.filesWritten.length !== 1 ? "s" : ""} written
          </div>
        )}
      </div>
    </div>
  )
}
