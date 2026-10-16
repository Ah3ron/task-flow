import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, CircleDot, ClipboardList,
  ExternalLink, GripVertical, Layers2, Pencil, Plus, Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
const statuses: Record<TaskStatus, { label: string; rowClass: string; iconClass: string; icon: typeof Circle }> = {
  todo: { label: "To do", rowClass: "border-base-300 bg-base-100", iconClass: "bg-base-200 text-base-content/55", icon: Circle },
  in_progress: { label: "In progress", rowClass: "border-info/30 bg-info/10", iconClass: "bg-info/15 text-info", icon: CircleDot },
  done: { label: "Done", rowClass: "border-success/30 bg-success/10", iconClass: "bg-success/15 text-success", icon: CheckCircle2 },
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-bold tracking-tight">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-content"><Layers2 className="size-5" /></div>
      <span className="text-lg">taskflow<span className="text-primary">.</span></span>
    </div>
  )
}

function TaskRow({ task, disabled, onEdit, onDelete, onUpdated }: { task: Task; disabled: boolean; onEdit: () => void; onDelete: () => void; onUpdated: (task: Task) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled })
  const Icon = statuses[task.status].icon
  const date = new Date(task.created_at)
  const dateLabel = Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)

  async function changeStatus(status: TaskStatus) {
    if (status === task.status || saving) return
    setSaving(true)
    setError(null)
    try {
      const updated = await tasksApi.update(task.id, { status })
      onUpdated(updated)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("card card-border relative rounded-xl shadow-sm shadow-base-content/5", statuses[task.status].rowClass, isDragging && "z-10 opacity-90 shadow-lg")}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1 p-2 sm:gap-x-3 sm:p-3">
        <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} disabled={disabled} aria-label={`Reorder ${task.title}`} className="flex size-8 touch-none cursor-grab items-center justify-center rounded-lg text-base-content/40 hover:bg-base-content/5 hover:text-base-content focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing disabled:cursor-not-allowed"><GripVertical className="size-4" /></button>
        <div className="min-w-0 pt-1">
          <div className="flex items-start gap-2.5">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", statuses[task.status].iconClass)}><Icon aria-hidden="true" className="size-4" /></span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("break-words text-sm font-semibold leading-5", task.status === "done" && "text-base-content/60 line-through")}>{task.title}</p>
              {task.description && <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-base-content/60">{task.description}</p>}
            </div>
          </div>
        </div>
        <div className="flex items-center text-base-content/50">
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${task.title}`} onClick={onEdit} disabled={saving || disabled}><Pencil /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${task.title}`} onClick={onDelete} disabled={saving || disabled}><Trash2 /></Button>
        </div>
        <div className="col-span-2 col-start-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:pl-8">
          <select aria-label={`Status for ${task.title}`} className="select select-ghost select-sm w-32 rounded-lg bg-base-100/80 text-xs font-semibold" value={task.status} disabled={saving || disabled} onChange={(event) => void changeStatus(event.target.value as TaskStatus)}>
            {(Object.keys(statuses) as TaskStatus[]).map((status) => <option key={status} value={status}>{statuses[status].label}</option>)}
          </select>
          <span className="text-xs text-base-content/50">Created {dateLabel}</span>
        </div>
        {error && <p role="alert" className="col-span-2 col-start-2 mt-2 break-words text-sm text-error sm:pl-8">Could not update status: {error}</p>}
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
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<Task | "new" | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const orders = useRef<Record<string, number[]>>({})
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const query = `${filter}:${page}`
  const showingPrevious = loadedQuery !== null && loadedQuery !== query

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    tasksApi.list(filter, page * PAGE_SIZE, PAGE_SIZE + 1, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.length === 0 && page > 0) {
          setPage((value) => value - 1)
          return
        }
        const items = result.slice(0, PAGE_SIZE)
        const order = orders.current[`${filter}:${page}`] ?? []
        const positions = new Map(order.map((id, index) => [id, index]))
        items.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity))
        setTasks(items)
        setHasNext(result.length > PAGE_SIZE)
        setLoadedQuery(`${filter}:${page}`)
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

  function reorder({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = tasks.findIndex((task) => task.id === active.id)
    const to = tasks.findIndex((task) => task.id === over.id)
    if (from < 0 || to < 0) return
    const next = arrayMove(tasks, from, to)
    orders.current[`${filter}:${page}`] = next.map((task) => task.id)
    setTasks(next)
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
              <span className="px-3 text-xs text-base-content/45" role="status">{loading && loadedQuery !== null ? `Updating tasks...${showingPrevious ? " Showing previous results." : ""}` : showingPrevious ? "Showing previous results" : loadedQuery !== null ? `${tasks.length} shown` : ""}</span>
            </div>

            {loading && loadedQuery === null ? (
              <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-base-content/55" role="status"><span className="loading loading-spinner loading-sm" /> Loading tasks...</div>
            ) : <>
              {error && <div role="alert" className="alert alert-error alert-soft m-4 w-auto flex flex-col items-start gap-3 sm:flex-row sm:items-center"><span>Could not load tasks: {error}{loadedQuery !== null && " Showing previous results."}</span><Button type="button" variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Try again</Button></div>}
              {loadedQuery !== null && tasks.length === 0 && !showingPrevious ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/8 text-primary"><ClipboardList className="size-6" /></div>
                <h3 className="mt-5 font-semibold">{filter === "all" ? "A fresh start" : "Nothing here yet"}</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-base-content/55">{filter === "all" ? "Your task list is clear. Create a task to get started." : "No tasks match this status. Try another filter or create a task."}</p>
                <Button type="button" variant="outline" size="sm" className="mt-5" onClick={() => setEditor("new")}><Plus /> Create task</Button>
              </div>
            ) : tasks.length > 0 ? (
              <>
                <p className="px-4 pt-4 text-xs text-base-content/55">Drag to reorder this page. Order resets when you reload.</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
                  <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <ul aria-label="Tasks" aria-busy={loading} className="space-y-2 p-3 sm:p-4">{tasks.map((task) => <TaskRow key={task.id} task={task} disabled={showingPrevious} onEdit={() => setEditor(task)} onDelete={() => setDeleting(task)} onUpdated={(updated) => { setTasks((current) => current.map((item) => item.id === updated.id ? updated : item)); setRevision((value) => value + 1) }} />)}</ul>
                  </SortableContext>
                </DndContext>
              </>
            ) : null}
            </>}
          </div>
          {loadedQuery !== null && (page > 0 || hasNext) && <div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm text-base-content/55">Page {page + 1}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0 || loading || showingPrevious} onClick={() => setPage((value) => value - 1)}><ArrowLeft /> Previous</Button><Button type="button" variant="outline" size="sm" disabled={!hasNext || loading || showingPrevious} onClick={() => setPage((value) => value + 1)}>Next <ArrowRight /></Button></div></div>}
        </section>
      </main>
      {editor !== null && <TaskForm task={editor === "new" ? null : editor} onClose={() => setEditor(null)} onSaved={saved} />}
      {deleting && <DeleteDialog task={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
    </div>
  )
}
