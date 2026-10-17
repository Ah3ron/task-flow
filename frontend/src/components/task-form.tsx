import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage, tasksApi, type Task, type TaskStatus } from "@/lib/api"

interface TaskFormProps {
  task: Task | null
  onClose: () => void
  onSaved: (isNew: boolean, saved: Task) => void
}

export function TaskForm({ task, onClose, onSaved }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "")
  const [description, setDescription] = useState(task?.description ?? "")
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) {
      setError("Please enter a task title.")
      return
    }
    setError(null)
    setSaving(true)
    const input = { title: title.trim(), description: description.trim() || null, status }
    try {
      const saved = task ? await tasksApi.update(task.id, input) : await tasksApi.create(input)
      onSaved(!task, saved)
    } catch (cause) {
      setError(errorMessage(cause))
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent
        onEscapeKeyDown={(event) => { if (saving) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (saving) event.preventDefault() }}
      >
        <div className="space-y-1.5 pr-6">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {task ? "Edit task" : "Create a task"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-base-content/60">
            {task ? "Update the details of your task." : "Give your next task a little structure."}
          </DialogDescription>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="task-title" className="text-sm font-semibold">Title <span className="text-error">*</span></label>
            <Input id="task-title" placeholder="e.g. Prepare project proposal" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} />
            <p className="text-xs text-base-content/50">A clear, short title works best. Up to 200 characters.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="task-description" className="text-sm font-semibold">Description <span className="font-normal text-base-content/45">(optional)</span></label>
            <Textarea id="task-description" placeholder="Add a little more detail..." value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <label htmlFor="task-status" className="text-sm font-semibold">Status</label>
            <select id="task-status" className="h-10 w-full rounded-lg border border-base-300 bg-base-100 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} disabled={saving}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          {error && <div role="alert" className="alert alert-error alert-soft text-sm">{error}</div>}
          <div className="flex flex-col-reverse gap-2 border-t border-base-300 pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : task ? "Save changes" : "Create task"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
