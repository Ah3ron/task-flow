import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, CircleDot, ClipboardList,
  ExternalLink, Layers2, Pencil, Plus, Trash2,
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

function TaskRow({ task, onEdit, onDelete }: { task: Task; onEdit: () => void; onDelete: () => void }) {
  const date = new Date(task.created_at)
  const dateLabel = Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-4 transition-colors hover:bg-base-200/60 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-center sm:px-5 md:grid-cols-[minmax(0,1fr)_8rem_6rem_auto]">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-5">{task.title}</p>
        {task.description && <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-base-content/55">{task.description}</p>}
      </div>
      <div className="col-start-1 row-start-2 flex items-center gap-3 sm:col-start-2 sm:row-start-1"><StatusBadge status={task.status} /><span className="text-xs text-base-content/45 sm:hidden">{dateLabel}</span></div>
      <span className="hidden text-xs text-base-content/50 md:col-start-3 md:row-start-1 md:block">{dateLabel}</span>
      <div className="col-start-2 row-start-1 -my-1 flex items-center gap-0.5 sm:col-start-3 md:col-start-4">
        <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${task.title}`} onClick={onEdit}><Pencil /></Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${task.title}`} onClick={onDelete}><Trash2 /></Button>
      </div>
    </li>
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
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <a href="/docs" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-base-content/55 hover:text-primary">API docs <ExternalLink className="size-3" /></a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <div className="flex items-start justify-between gap-4">
          <div><h1 id="tasks-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">My tasks</h1><p className="mt-1.5 text-sm text-base-content/55">Keep track of what needs doing.</p></div>
          <Button type="button" onClick={() => setEditor("new")}><Plus /> New task</Button>
        </div>

        <section aria-labelledby="tasks-heading" className="mt-8">
          <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-2 py-2 sm:px-3">
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter tasks">
                {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => selectFilter(item.value)} className={cn("rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary", filter === item.value ? "bg-base-200 text-base-content" : "text-base-content/55 hover:text-base-content")}>{item.label}</button>)}
              </div>
              <span className="px-3 text-xs text-base-content/45">{!loading && !error ? `${tasks.length} shown` : ""}</span>
            </div>

            {loading ? (
              <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-base-content/55" role="status"><span className="loading loading-spinner loading-sm" /> Loading tasks...</div>
            ) : error ? (
              <div role="alert" className="alert alert-error alert-soft m-4 w-auto flex flex-col items-start gap-3 sm:flex-row sm:items-center"><span>Could not load tasks: {error}</span><Button type="button" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div>
            ) : tasks.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary"><ClipboardList className="size-6" /></div>
                <h3 className="mt-5 font-semibold">{filter === "all" ? "A fresh start" : "Nothing here yet"}</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-base-content/55">{filter === "all" ? "Your task list is clear. Create a task to get started." : "No tasks match this status. Try another filter or create a task."}</p>
                <Button type="button" variant="outline" size="sm" className="mt-5" onClick={() => setEditor("new")}><Plus /> Create task</Button>
              </div>
            ) : (
              <>
                <div aria-hidden="true" className="hidden items-center gap-3 border-b border-base-300 bg-base-200/50 px-5 py-2 text-xs font-medium text-base-content/45 sm:flex"><span className="flex-1">Task</span><span className="w-32">Status</span><span className="hidden w-24 md:block">Created</span><span className="w-20">Actions</span></div>
                <ul aria-label="Tasks" className="divide-y divide-base-300">{tasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => setEditor(task)} onDelete={() => setDeleting(task)} />)}</ul>
              </>
            )}
          </div>
          {!loading && !error && (page > 0 || hasNext) && <div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm text-base-content/55">Page {page + 1}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ArrowLeft /> Previous</Button><Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>Next <ArrowRight /></Button></div></div>}
        </section>
      </main>
      {editor !== null && <TaskForm task={editor === "new" ? null : editor} onClose={() => setEditor(null)} onSaved={saved} />}
      {deleting && <DeleteDialog task={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
    </div>
  )
}
