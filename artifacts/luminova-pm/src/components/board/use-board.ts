import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  createBoardGroup,
  createBoardItem,
  deleteBoardGroup,
  deleteBoardItem,
  importBoardItems,
  getGetBoardScheduleQueryKey,
  getGetProjectQueryKey,
  getGetProjectBoardQueryKey,
  getGetProjectsQueryKey,
  updateBoardGroup,
  updateBoardItem,
  useGetProjectBoard,
  type BoardGroupInput,
  type BoardGroupUpdate,
  type BoardItem,
  type BoardItemInput,
  type BoardItemUpdate,
  type BoardImportInput,
  type BoardImportResult,
  type ProjectBoard,
} from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"

function errorMessage(error: unknown) {
  const data = (error as { data?: { error?: unknown } } | null)?.data
  return typeof data?.error === "string" ? data.error : "Check your connection and try again."
}

function reorder<T extends { id: string; position: number }>(list: T[], id: string, position: number) {
  const moving = list.find((entry) => entry.id === id)
  if (!moving) return list
  const rest = list.filter((entry) => entry.id !== id).sort((a, b) => a.position - b.position)
  rest.splice(Math.max(0, Math.min(position, rest.length)), 0, moving)
  return rest.map((entry, index) => ({ ...entry, position: index }))
}

/** Applies an item update locally so the board responds before the server does. */
export function applyItemUpdate(board: ProjectBoard, itemId: string, update: BoardItemUpdate): ProjectBoard {
  const item = board.items.find((entry) => entry.id === itemId)
  if (!item) return board
  const { position, ...fields } = update
  const moved: BoardItem = { ...item, ...fields } as BoardItem
  let items = board.items.map((entry) => (entry.id === itemId ? moved : entry))
  if (position !== undefined || moved.groupId !== item.groupId) {
    const target = items.filter((entry) => entry.groupId === moved.groupId)
    const reordered = reorder(target, itemId, position ?? target.length)
    // The group the item left closes its gap.
    const source = moved.groupId === item.groupId
      ? []
      : items
          .filter((entry) => entry.groupId === item.groupId && entry.id !== itemId)
          .sort((a, b) => a.position - b.position)
          .map((entry, index) => ({ ...entry, position: index }))
    const replaced = new Map([...reordered, ...source].map((entry) => [entry.id, entry]))
    items = items.map((entry) => replaced.get(entry.id) ?? entry)
  }
  return { ...board, items }
}

export function useBoard(projectId: string, enabled = true) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const key = getGetProjectBoardQueryKey(projectId)
  const query = useGetProjectBoard(projectId, { query: { enabled: enabled && Boolean(projectId), queryKey: key } })

  const settle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: getGetBoardScheduleQueryKey() })
    void queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
    void queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() })
  }, [queryClient, key, projectId])

  /** Runs a change optimistically, restoring the previous board if the server refuses it. */
  const optimistic = useCallback(async (apply: (board: ProjectBoard) => ProjectBoard, send: () => Promise<unknown>, failure: string) => {
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<ProjectBoard>(key)
    if (previous) queryClient.setQueryData(key, apply(previous))
    try {
      await send()
      return true
    } catch (error) {
      if (previous) queryClient.setQueryData(key, previous)
      toast({ title: failure, description: errorMessage(error), variant: "destructive" })
      return false
    } finally {
      settle()
    }
  }, [queryClient, key, settle, toast])

  const updateItem = useCallback((itemId: string, update: BoardItemUpdate) => optimistic(
    (board) => applyItemUpdate(board, itemId, update),
    () => updateBoardItem(projectId, itemId, update),
    "Change not saved",
  ), [optimistic, projectId])

  const addItem = useCallback(async (input: BoardItemInput) => {
    try {
      const created = await createBoardItem(projectId, input)
      queryClient.setQueryData<ProjectBoard>(key, (board) => board ? { ...board, items: [...board.items, created] } : board)
      settle()
      return created
    } catch (error) {
      toast({ title: "Item not added", description: errorMessage(error), variant: "destructive" })
      return null
    }
  }, [projectId, queryClient, key, settle, toast])

  const removeItem = useCallback((itemId: string) => optimistic(
    (board) => ({
      ...board,
      items: board.items
        .filter((entry) => entry.id !== itemId)
        .map((entry) => (entry.dependsOnId === itemId ? { ...entry, dependsOnId: null } : entry)),
    }),
    () => deleteBoardItem(projectId, itemId),
    "Item not deleted",
  ), [optimistic, projectId])

  const addGroup = useCallback(async (input: BoardGroupInput) => {
    try {
      const created = await createBoardGroup(projectId, input)
      queryClient.setQueryData<ProjectBoard>(key, (board) => board ? { ...board, groups: [...board.groups, created] } : board)
      settle()
      return created
    } catch (error) {
      toast({ title: "Group not added", description: errorMessage(error), variant: "destructive" })
      return null
    }
  }, [projectId, queryClient, key, settle, toast])

  const importItems = useCallback(async (input: BoardImportInput): Promise<BoardImportResult | null> => {
    try {
      const created = await importBoardItems(projectId, input)
      queryClient.setQueryData<ProjectBoard>(key, (board) => board
        ? {
            ...board,
            groups: [...board.groups, ...created.groups],
            items: [...board.items, ...created.items],
          }
        : board)
      settle()
      return created
    } catch (error) {
      toast({ title: "Schedule import not saved", description: errorMessage(error), variant: "destructive" })
      return null
    }
  }, [projectId, queryClient, key, settle, toast])

  const updateGroup = useCallback((groupId: string, update: BoardGroupUpdate) => optimistic(
    (board) => {
      const groups = board.groups.map((group) => (group.id === groupId ? { ...group, ...update, position: group.position } : group))
      return { ...board, groups: update.position === undefined ? groups : reorder(groups, groupId, update.position) }
    },
    () => updateBoardGroup(projectId, groupId, update),
    "Group not updated",
  ), [optimistic, projectId])

  const removeGroup = useCallback((groupId: string) => optimistic(
    (board) => ({
      ...board,
      groups: board.groups.filter((group) => group.id !== groupId),
      items: board.items.filter((item) => item.groupId !== groupId),
    }),
    () => deleteBoardGroup(projectId, groupId),
    "Group not deleted",
  ), [optimistic, projectId])

  return { ...query, updateItem, addItem, removeItem, addGroup, updateGroup, removeGroup, importItems }
}

export type BoardActions = Pick<ReturnType<typeof useBoard>, "updateItem" | "addItem" | "removeItem" | "addGroup" | "updateGroup" | "removeGroup" | "importItems">
