import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerFooter } from '../PlayerFooter'

describe('PlayerFooter', () => {
  test('fires prev/next/toggle callbacks (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const onPrev = jest.fn()
    const onNext = jest.fn()
    const onTogglePlay = jest.fn()
    render(
      <PlayerFooter
        currentTime={0}
        duration={120}
        isPlaying={false}
        onPrev={onPrev}
        onNext={onNext}
        onTogglePlay={onTogglePlay}
        onSeek={() => {}}
      />,
    )

    // Act
    await user.click(screen.getByRole('button', { name: /previous verse/i }))
    await user.click(screen.getByRole('button', { name: /play/i }))
    await user.click(screen.getByRole('button', { name: /next verse/i }))

    // Assert
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onTogglePlay).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  test('seeks via range input and shows time labels (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const onSeek = jest.fn()
    render(
      <PlayerFooter
        currentTime={45.5}
        duration={120}
        isPlaying={true}
        onPrev={() => {}}
        onNext={() => {}}
        onTogglePlay={() => {}}
        onSeek={onSeek}
      />,
    )

    // Act
    const range = screen.getByTestId('seek') as HTMLInputElement
    fireEvent.change(range, { target: { value: '60' } })

    // Assert
    expect(onSeek).toHaveBeenCalled()
    expect(screen.getByLabelText('time')).toHaveTextContent('0:45')
    expect(screen.getByLabelText('time')).toHaveTextContent('2:00')
  })
})
