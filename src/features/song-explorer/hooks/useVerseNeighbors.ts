import { useMemo } from 'react'

export interface NeighborWindow {
  start: number
  end: number
  indices: number[]
}

export function getNeighborWindow(currentIndex: number, total: number, win: number = 2): NeighborWindow {
  if (total <= 0) return { start: 0, end: -1, indices: [] }
  const clampedCurrent = Math.max(0, Math.min(currentIndex, total - 1))
  const start = Math.max(0, clampedCurrent - win)
  const end = Math.min(total - 1, clampedCurrent + win)
  const indices: number[] = []
  for (let i = start; i <= end; i++) indices.push(i)
  return { start, end, indices }
}

export function useVerseNeighbors(currentIndex: number, total: number, win: number = 2) {
  return useMemo(() => getNeighborWindow(currentIndex, total, win), [currentIndex, total, win])
}

export default useVerseNeighbors

