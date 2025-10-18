import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BasicView } from '../BasicView'
import { makeVerses } from '../../fixtures/sampleVerses'

describe('BasicView', () => {
  test('renders current ±2 neighbors and marks active (AAA)', async () => {
    // Arrange
    const verses = makeVerses(10)
    const onSelect = jest.fn()

    // Act
    render(<BasicView verses={verses} currentIndex={5} onSelectVerse={onSelect} />)

    // Assert
    const items = await screen.findAllByTestId('verse-item')
    expect(items).toHaveLength(5)
    const active = items.find((el) => el.getAttribute('data-active') === 'true')
    expect(active).toBeTruthy()
    expect(active?.getAttribute('data-index')).toBe('5')
  })

  test('clamps window at start and end (AAA)', async () => {
    // Arrange
    const verses = makeVerses(3)
    const onSelect = jest.fn()

    // Act + Assert (start)
    const { rerender } = render(<BasicView verses={verses} currentIndex={0} onSelectVerse={onSelect} />)
    expect(await screen.findAllByTestId('verse-item')).toHaveLength(3)

    // Act + Assert (end)
    rerender(<BasicView verses={verses} currentIndex={2} onSelectVerse={onSelect} />)
    expect(await screen.findAllByTestId('verse-item')).toHaveLength(3)
  })

  test('clicking a neighbor invokes onSelectVerse with absolute index (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const verses = makeVerses(10)
    const onSelect = jest.fn()
    render(<BasicView verses={verses} currentIndex={5} onSelectVerse={onSelect} />)

    // Act: click first item in the slice (absolute index 3)
    const first = (await screen.findAllByTestId('verse-item'))[0]
    await user.click(first)

    // Assert
    expect(onSelect).toHaveBeenCalledWith(3)
  })
})

