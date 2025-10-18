import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewTabs, type ViewTier } from '../ViewTabs'

describe('ViewTabs', () => {
  test('renders three tabs and highlights active (AAA)', async () => {
    // Arrange
    const onChange = jest.fn()
    render(<ViewTabs active="basic" onChange={onChange} />)

    // Act
    const tabs = await screen.findByTestId('view-tabs')

    // Assert
    expect(tabs).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /basic/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /snapshot/i })).toHaveAttribute('aria-pressed', 'false')
  })

  test('invokes onChange with chosen tier (AAA)', async () => {
    // Arrange
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<ViewTabs active="basic" onChange={onChange} />)

    // Act
    await user.click(screen.getByRole('button', { name: /advanced/i }))
    await user.click(screen.getByRole('button', { name: /snapshot/i }))

    // Assert
    expect(onChange).toHaveBeenNthCalledWith(1, 'advanced' as ViewTier)
    expect(onChange).toHaveBeenNthCalledWith(2, 'snapshot' as ViewTier)
  })
})
