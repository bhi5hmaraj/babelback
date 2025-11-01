import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SnapshotView } from '../SnapshotView'

describe('SnapshotView', () => {
  test('shows truncated text when collapsed and full when expanded (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const summary = 'A'.repeat(300)

    // Act
    render(<SnapshotView title="Song Snapshot" summary={summary} defaultExpanded={false} />)

    // Assert (collapsed)
    const textBefore = screen.getByTestId('snapshot-text').textContent || ''
    expect(textBefore.length).toBeLessThan(summary.length)

    // Act (expand)
    await user.click(screen.getByRole('button', { name: /show more/i }))

    // Assert (expanded)
    expect(screen.getByTestId('snapshot-text')).toHaveTextContent(summary)
  })

  test('falls back to default when summary is missing (AAA)', () => {
    // Arrange
    render(<SnapshotView />)

    // Assert
    expect(screen.getByTestId('snapshot-text')).toHaveTextContent('Upload a track')
  })
})

