import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, CircleDot, ClipboardList,
  ExternalLink, Layers2, ListTodo, Pencil, Plus, Sparkles, Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"

import { TaskForm } from "@/components/task-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { errorMessage, tasksApi, type Task, type TaskFilter, type TaskStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 8
const filters: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
]
const statuses: Record<TaskStatus, { label: string; className: string; icon: typeof Circle }> = {
  todo: { label: "To do", className: "bg-base-200 text-base-content/65", icon: Circle },
  in_progress: { label: "In progress", className: "bg-info/10 text-info", icon: CircleDot },
  done: { label: "Done", className: "bg-success/10 text-success", icon: CheckCircle2 },
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-bold tracking-tight">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-content"><Layers2 className="size-5" /></div>
      <span className="text-lg">taskflow<span className="text-primary">.</span></span>
    </div>
  )
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, className, icon: Icon } = statuses[status]
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", className)}><Icon className="size-3.5" />{label}</span>
}

function TaskCard({ task, onEdit, onDelete }: { task: Task; onEdit: () => void; onDelete: () => void }) {
  const date = new Date(task.created_at)
  const dateLabel = Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)
  return (
    <article className="group flex min-h-48 flex-col rounded-xl border border-base-300 bg-base-100 p-5 shadow-[0_1px_2px_rgba(20,24,40,0.03)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={task.status} />
        <div className="-mt-1.5 -mr-1.5 flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${task.title}`} onClick={onEdit}><Pencil /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${task.title}`} onClick={onDelete}><Trash2 /></Button>
        </div>
      </div>
      <h3 className="mt-5 break-words text-[15px] font-semibold leading-snug">{task.title}</h3>
      <p className="mt-2 line-clamp-2 min-h-10 break-words text-sm leading-5 text-base-content/55">{task.description || "No description added."}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-base-300/70 pt-4 text-xs text-base-content/45">
        <span>Created {dateLabel}</span><span>#{task.id}</span>
      </div>
    </article>
  )
}

function DeleteDialog({ task, onClose, onDeleted }: { task: Task; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function confirm() {
    setDeleting(true)
    setError(null)
    try {
      await tasksApi.delete(task.id)
      onDeleted()
    } catch (cause) {
      setError(errorMessage(cause))
      setDeleting(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !deleting) onClose() }}>
      <DialogContent onEscapeKeyDown={(event) => { if (deleting) event.preventDefault() }} onPointerDownOutside={(event) => { if (deleting) event.preventDefault() }}>
        <div className="flex size-11 items-center justify-center rounded-xl bg-error/10 text-error"><Trash2 className="size-5" /></div>
        <div className="space-y-1.5 pr-5">
          <DialogTitle className="text-xl font-semibold">Delete task?</DialogTitle>
          <DialogDescription className="break-words text-sm leading-6 text-base-content/60">This will permanently delete “{task.title}”. This action cannot be undone.</DialogDescription>
        </div>
        {error && <div role="alert" className="alert alert-error alert-soft text-sm">{error}</div>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={deleting}>{deleting ? "Deleting..." : "Delete task"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function App() {
  const [filter, setFilter] = useState<TaskFilter>("all")
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [tasks, setTasks] = useState<Task[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<Task | "new" | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    tasksApi.list(filter, page * PAGE_SIZE, PAGE_SIZE + 1, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setTasks(result.slice(0, PAGE_SIZE))
        setHasNext(result.length > PAGE_SIZE)
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filter, page, revision])

  function selectFilter(value: TaskFilter) {
    setFilter(value)
    setPage(0)
  }

  function saved(isNew: boolean) {
    setEditor(null)
    if (isNew) { setFilter("all"); setPage(0) }
    setRevision((value) => value + 1)
  }

  function deleted() {
    setDeleting(null)
    if (page > 0 && tasks.length === 1) setPage((value) => value - 1)
    else setRevision((value) => value + 1)
  }

  return (
    <div className="min-h-screen bg-base-200">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-base-300 bg-base-100 px-5 py-7 md:flex">
        <div className="px-2"><Logo /></div>
        <p className="mt-12 px-3 text-[10px] font-bold tracking-[0.16em] text-base-content/40 uppercase">Workspace</p>
        <div aria-current="page" className="mt-3 flex items-center gap-3 rounded-lg bg-primary/8 px-3 py-3 text-sm font-semibold text-primary"><ListTodo className="size-[18px]" /> My tasks</div>
        <div className="mt-auto rounded-xl border border-base-300 bg-base-200/60 p-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-base-100 text-primary"><Sparkles className="size-4" /></div>
          <p className="mt-3 text-sm font-semibold">A little more focus.</p>
          <p className="mt-1 text-xs leading-5 text-base-content/55">One task at a time, one step closer.</p>
        </div>
        <a href="/docs" target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-2 px-2 text-xs font-medium text-base-content/55 hover:text-primary">API documentation <ExternalLink className="size-3" /></a>
      </aside>

      <div className="md:pl-60">
        <header className="flex h-17 items-center justify-between border-b border-base-300 bg-base-100 px-5 sm:px-8 lg:px-12">
          <div className="md:hidden"><Logo /></div>
          <div className="hidden items-center gap-2 text-sm text-base-content/45 md:flex"><span>Workspace</span><span>/</span><span className="font-medium text-base-content/75">My tasks</span></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-base-300 px-3 py-1.5 text-xs font-medium text-base-content/55"><span className="size-1.5 rounded-full bg-success" /> Personal workspace</span>
        </header>

        <main className="mx-auto max-w-7xl px-5 pt-10 pb-16 sm:px-8 lg:px-12 lg:pt-14">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary uppercase"><span className="h-px w-5 bg-primary" /> Your workspace</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Make room for progress.</h1>
              <p className="mt-2.5 text-sm leading-6 text-base-content/55">Keep your tasks organised and your day moving forward.</p>
            </div>
            <Button type="button" onClick={() => setEditor("new")}><Plus /> New task</Button>
          </div>

          <section aria-labelledby="tasks-heading" className="mt-12">
            <div className="flex flex-col justify-between gap-4 border-b border-base-300 pb-5 sm:flex-row sm:items-end">
              <div><h2 id="tasks-heading" className="text-lg font-bold tracking-tight">My tasks</h2><p className="mt-1 text-sm text-base-content/50">Everything you need to get done, in one place.</p></div>
              <span className="text-xs font-medium text-base-content/45">{!loading && !error ? `${tasks.length} shown` : " "}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 border-b border-base-300 py-3" aria-label="Filter tasks">
              {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => selectFilter(item.value)} className={cn("rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary", filter === item.value ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/55 hover:text-base-content")}>{item.label}</button>)}
            </div>

            {loading ? (
              <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-base-content/55" role="status"><span className="loading loading-spinner loading-sm" /> Loading tasks...</div>
            ) : error ? (
              <div role="alert" className="alert alert-error alert-soft mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center"><span>Could not load tasks: {error}</span><Button type="button" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div>
            ) : tasks.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-100/60 px-6 text-center mt-6">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary"><ClipboardList className="size-6" /></div>
                <h3 className="mt-5 font-semibold">{filter === "all" ? "A fresh start" : "Nothing here yet"}</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-base-content/55">{filter === "all" ? "Your task list is clear. Create a task to get started." : "No tasks match this status. Try another filter or create a task."}</p>
                <Button type="button" variant="outline" size="sm" className="mt-5" onClick={() => setEditor("new")}><Plus /> Create task</Button>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={() => setEditor(task)} onDelete={() => setDeleting(task)} />)}</div>
            )}

            {!loading && !error && (page > 0 || hasNext) && <div className="mt-7 flex items-center justify-between border-t border-base-300 pt-5"><span className="text-sm text-base-content/55">Page {page + 1}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ArrowLeft /> Previous</Button><Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>Next <ArrowRight /></Button></div></div>}
          </section>
          <div className="mt-12 flex items-center gap-2 text-xs text-base-content/40"><Check className="size-3.5" /> Built for making progress, one task at a time.</div>
        </main>
      </div>
      {editor !== null && <TaskForm task={editor === "new" ? null : editor} onClose={() => setEditor(null)} onSaved={saved} />}
      {deleting && <DeleteDialog task={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
    </div>
  )
}
