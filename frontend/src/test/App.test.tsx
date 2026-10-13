import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import type { Task, TaskInput } from "@/lib/api"

let tasks: Task[]

function task(id: number, status: Task["status"] = "todo"): Task {
  return { id, title: `Task ${id}`, description: null, status, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }
}

function mockApi() {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost")
    const method = init?.method ?? "GET"
    const id = Number(url.pathname.split("/").at(-1))
    if (method === "GET") {
      const status = url.searchParams.get("status")
      const offset = Number(url.searchParams.get("offset"))
      const limit = Number(url.searchParams.get("limit"))
      const filtered = tasks.filter((item) => !status || item.status === status)
      return Response.json(filtered.slice(offset, offset + limit))
    }
    if (method === "POST") {
      const payload = JSON.parse(String(init?.body)) as TaskInput
      const created = { ...task(tasks.length + 1), ...payload }
      tasks.push(created)
      return Response.json(created, { status: 201 })
    }
    if (method === "PATCH") {
      const payload = JSON.parse(String(init?.body)) as TaskInput
      const found = tasks.find((item) => item.id === id)!
      Object.assign(found, payload)
      return Response.json(found)
    }
    if (method === "DELETE") {
      tasks = tasks.filter((item) => item.id !== id)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 500 })
  })
  vi.stubGlobal("fetch", mock)
  return mock
}

beforeEach(() => { tasks = []; mockApi() })

describe("task workspace", () => {
  it("creates, edits and deletes a task through the API", async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText("A fresh start")
    await user.click(screen.getByRole("button", { name: "New task" }))
    let dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/title/i), "Write tests")
    await user.type(within(dialog).getByLabelText(/description/i), "Cover the API")
    await user.click(within(dialog).getByRole("button", { name: "Create task" }))
    expect(await screen.findByText("Write tests")).toBeInTheDocument()
    expect(screen.getByText("Cover the API")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Edit Write tests" }))
    dialog = screen.getByRole("dialog")
    await user.selectOptions(within(dialog).getByLabelText("Status"), "done")
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(tasks[0].status).toBe("done"))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByText("Done", { selector: "span" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Delete Write tests" }))
    dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText(/permanently delete/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Delete task" }))
    expect(await screen.findByText("A fresh start")).toBeInTheDocument()
    expect(tasks).toHaveLength(0)
  })

  it("filters tasks and paginates without dropping results", async () => {
    tasks = Array.from({ length: 9 }, (_, index) => task(index + 1, index === 8 ? "done" : "todo"))
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText("Task 1")).toBeInTheDocument()
    const list = screen.getByRole("list", { name: "Tasks" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(8)
    expect(within(list).getByRole("button", { name: "Edit Task 1" })).toBeInTheDocument()
    expect(screen.queryByText("Task 9")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /next/i }))
    expect(await screen.findByText("Task 9")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /previous/i }))
    expect(await screen.findByText("Task 1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(await screen.findByText("Task 9")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText("Task 1")).not.toBeInTheDocument()
  })

  it("shows a retryable error when the API is unavailable", async () => {
    const fetchMock = mockApi()
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"))
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable")
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("A fresh start")).toBeInTheDocument()
  })
})
