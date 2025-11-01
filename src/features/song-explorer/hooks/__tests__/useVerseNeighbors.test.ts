import { getNeighborWindow } from '../../hooks/useVerseNeighbors'

describe('getNeighborWindow', () => {
  test('middle index yields ±2 (AAA)', () => {
    // Arrange
    const current = 5
    const total = 12
    const win = 2

    // Act
    const res = getNeighborWindow(current, total, win)

    // Assert
    expect(res).toEqual({ start: 3, end: 7, indices: [3,4,5,6,7] })
  })

  test('clamps near start (AAA)', () => {
    // Arrange
    const current = 0
    const total = 4

    // Act
    const res = getNeighborWindow(current, total, 2)

    // Assert
    expect(res).toEqual({ start: 0, end: 2, indices: [0,1,2] })
  })

  test('clamps near end (AAA)', () => {
    // Arrange
    const current = 9
    const total = 10

    // Act
    const res = getNeighborWindow(current, total, 2)

    // Assert
    expect(res).toEqual({ start: 7, end: 9, indices: [7,8,9] })
  })
})
