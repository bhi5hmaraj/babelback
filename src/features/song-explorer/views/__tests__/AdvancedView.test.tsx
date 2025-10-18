import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdvancedView } from '../AdvancedView'
import { makeVerses } from '../../fixtures/sampleVerses'

describe('AdvancedView', () => {
  test('original always shows; overlays follow options (AAA)', async () => {
    // Arrange
    const verses = makeVerses(6)
    const onSelect = jest.fn()

    // Act
    render(
      <AdvancedView
        verses={verses}
        currentIndex={2}
        options={{ transliteration: true, translation: false, meaning: true }}
        onSelectVerse={onSelect}
      />,
    )

    // Assert
    expect(await screen.findAllByTestId('adv-verse-item')).toHaveLength(5)
    expect(screen.getAllByTestId('adv-original').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('adv-transliteration').length).toBeGreaterThan(0)
    expect(screen.queryAllByTestId('adv-translation').length).toBe(0)
    expect(screen.getAllByTestId('adv-meaning').length).toBeGreaterThan(0)
  })

  test('clicking a neighbor invokes onSelectVerse with absolute index (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const verses = makeVerses(10)
    const onSelect = jest.fn()
    render(
      <AdvancedView
        verses={verses}
        currentIndex={5}
        options={{ transliteration: false, translation: true, meaning: false }}
        onSelectVerse={onSelect}
      />,
    )

    // Act
    const first = (await screen.findAllByTestId('adv-verse-item'))[0]
    await user.click(first)

    // Assert
    expect(onSelect).toHaveBeenCalledWith(3)
  })
})

