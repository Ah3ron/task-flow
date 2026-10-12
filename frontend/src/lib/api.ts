export type TaskStatus = "todo" | "in_progress" | "done"
export type TaskFilter = TaskStatus | "all"

export interface Task {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

export interface TaskInput {
  title: string
  description: string | null
  status: TaskStatus
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`
    try {
      const body: unknown = await response.json()
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
        message = body.detail
      }
    } catch {
      // The server may return an empty or non-JSON error response.
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const tasksApi = {
  list(filter: TaskFilter, offset: number, limit: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    if (filter !== "all") params.set("status", filter)
    return request<Task[]>(`/tasks?${params}`, { signal })
  },
  create(input: TaskInput) {
    return request<Task>("/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    })
  },
  update(id: number, input: TaskInput) {
    return request<Task>(`/tasks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    })
  },
  delete(id: number) {
    return request<void>(`/tasks/${id}`, { method: "DELETE" })
  },
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again."
}
