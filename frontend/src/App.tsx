import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, CircleDot, ClipboardList,
  ExternalLink, GripVertical, Layers2, Pencil, Plus, Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"

import { TaskForm } from "@/components/task-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { errorMessage, tasksApi, type Task, type TaskFilter, type TaskStatus } from "@/lib/api"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 8
const ORDER_STORAGE_KEY = "taskflow.task-order.v1"

function loadOrders(): Record<string, number[]> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? "{}")
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([key, value]) =>
      /^(all|todo|in_progress|done):\d+$/.test(key) && Array.isArray(value) && value.every((id: unknown) => Number.isSafeInteger(id) && (id as number) > 0),
    ))
  } catch {
    return {}
  }
}

const filters: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
]
const statuses: Record<TaskStatus, { label: string; rowClass: string; iconClass: string; icon: typeof Circle }> = {
  todo: { label: "To do", rowClass: "border-base-300 bg-base-100", iconClass: "bg-base-200 text-base-content/55", icon: Circle },
  in_progress: { label: "In progress", rowClass: "border-info/30 bg-info/10", iconClass: "bg-info/15 text-info", icon: CircleDot },
  done: { label: "Done", rowClass: "border-base-300 bg-base-200", iconClass: "bg-base-300 text-base-content/60", icon: CheckCircle2 },
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 font-bold tracking-tight">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-content"><Layers2 className="size-5" /></div>
      <span className="text-lg">taskflow<span className="text-primary">.</span></span>
    </div>
  )
}

function TaskRow({ task, disabled, onEdit, onDelete }: { task: Task; disabled: boolean; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled })
  const Icon = statuses[task.status].icon
  const date = new Date(task.created_at)
  const dateLabel = Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("card card-border relative rounded-xl shadow-sm shadow-base-content/5", statuses[task.status].rowClass, isDragging && "z-10 opacity-90 shadow-lg")}>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)]">
        <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} disabled={disabled} aria-label={`Reorder ${task.title}`} className="flex w-11 touch-none cursor-grab items-center justify-center self-stretch rounded-l-xl border-r border-base-content/5 text-base-content/40 hover:bg-base-content/5 hover:text-base-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary active:cursor-grabbing disabled:cursor-not-allowed"><GripVertical className="size-5" /></button>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 p-2 sm:p-3">
          <div className="col-span-2 flex min-w-0 items-start gap-2.5 pt-1 sm:col-span-1">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", statuses[task.status].iconClass)}><Icon aria-hidden="true" className="size-4" /></span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("break-words text-sm font-semibold leading-5", task.status === "done" && "text-base-content/70 line-through")}>{task.title}</p>
              {task.description && <p className={cn("mt-1 line-clamp-2 break-words text-sm leading-5 text-base-content/60", task.status === "done" && "text-base-content/65")}>{task.description}</p>}
            </div>
          </div>
          <div className="col-start-2 row-start-2 flex items-center text-base-content/50 sm:row-start-1">
            <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${task.title}`} onClick={onEdit} disabled={disabled}><Pencil /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${task.title}`} onClick={onDelete} disabled={disabled}><Trash2 /></Button>
          </div>
          <span className="badge badge-ghost badge-sm col-start-1 row-start-2 self-center sm:ml-8">{statuses[task.status].label}</span>
          <time dateTime={task.created_at} className="col-span-2 row-start-3 justify-self-end text-right text-xs text-base-content/50 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:self-end">Created {dateLabel}</time>
        </div>
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
  const [orders] = useState(loadOrders)
  const [orderSaveError, setOrderSaveError] = useState(false)
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
        const order = orders[`${filter}:${page}`] ?? []
        const positions = new Map(order.map((id, index) => [id, index]))
        items.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity))
        setTasks(items)
        setHasNext(result.length > PAGE_SIZE)
        setLoadedQuery(`${filter}:${page}`)
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filter, page, revision, orders])

  function selectFilter(value: TaskFilter) {
    setFilter(value)
    setPage(0)
  }

  function saved(isNew: boolean, updated: Task) {
    setEditor(null)
    if (isNew) { setFilter("all"); setPage(0) }
    else setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
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
    orders[query] = next.map((task) => task.id)
    try {
      localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders))
      setOrderSaveError(false)
    } catch {
      setOrderSaveError(true)
    }
    setTasks(next)
  }

  return (
    <div className="min-h-screen bg-base-200">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <a href="/docs" target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-base-content/55 hover:text-primary">API docs <ExternalLink className="size-3" /></a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
        <div className="flex flex-col items-stretch gap-4 min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between">
          <div><h1 id="tasks-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">My tasks</h1><p className="mt-1.5 text-sm text-base-content/55">Keep track of what needs doing.</p></div>
          <Button type="button" onClick={() => setEditor("new")}><Plus /> New task</Button>
        </div>

        <section aria-labelledby="tasks-heading" className="mt-8">
          <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-2 py-2 sm:px-3">
              <div className="grid w-full grid-cols-2 gap-1 min-[480px]:flex min-[480px]:w-auto min-[480px]:flex-wrap min-[480px]:items-center" role="group" aria-label="Filter tasks">
                {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => selectFilter(item.value)} className={cn("min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary", filter === item.value ? "bg-base-200 text-base-content" : "text-base-content/55 hover:text-base-content")}>{item.label}</button>)}
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
                <p className="px-4 pt-4 text-xs text-base-content/55">Drag to reorder this page. Order is saved in this browser for each filter and page.</p>
                {orderSaveError && <div role="alert" className="alert alert-warning alert-soft mx-4 mt-3 w-auto text-sm">Could not save the order in this browser. The latest order will not persist after reload.</div>}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
                  <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <ul aria-label="Tasks" aria-busy={loading} className="space-y-2 p-3 sm:p-4">{tasks.map((task) => <TaskRow key={task.id} task={task} disabled={showingPrevious} onEdit={() => setEditor(task)} onDelete={() => setDeleting(task)} />)}</ul>
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
