import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerseSheet } from '../VerseSheet'

const verse = {
  verseNumber: 1,
  original: 'Original',
  transliteration: 'Translit',
  translation: 'Translation',
  meaning: 'Meaning',
  startTime: 0,
  endTime: 2,
}

describe('VerseSheet', () => {
  test('renders when open and displays verse content (AAA)', () => {
    // Arrange
    const noop = () => {}

    // Act
    render(<VerseSheet open verse={verse as any} onOpenChange={noop} />)

    // Assert
    expect(screen.getByTestId('verse-sheet')).toBeInTheDocument()
    expect(screen.getByText('Original')).toBeInTheDocument()
    expect(screen.getByText('Meaning')).toBeInTheDocument()
  })

  test('invokes onOpenChange(false) when closed (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<VerseSheet open verse={verse as any} onOpenChange={onOpenChange} />)

    // Act
    await user.click(screen.getByRole('button', { name: /close/i }))

    // Assert
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

