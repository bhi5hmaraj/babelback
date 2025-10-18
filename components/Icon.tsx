"use client"

import type React from "react"

interface IconProps {
  name: string
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | number
  className?: string
}

/**
 * Simple icon wrapper component.
 * In a real app, this would integrate with an icon library like Phosphor Icons.
 * For now, it renders a placeholder or you can integrate your preferred icon system.
 */
const Icon: React.FC<IconProps> = ({ name, weight = "regular", size = "md", className = "" }) => {
  // Map size to actual pixel values
  const sizeMap = {
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
    "2xl": 40,
  }

  const pixelSize = typeof size === "number" ? size : sizeMap[size]

  // This is a placeholder implementation
  // In production, you'd use an actual icon library like:
  // import { Icon as PhosphorIcon } from "@phosphor-icons/react"
  // return <PhosphorIcon name={name} weight={weight} size={pixelSize} className={className} />

  return (
    <span
      className={`inline-block ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
      role="img"
      aria-label={name}
    >
      {/* Placeholder - replace with actual icon library */}
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox="0 0 256 256"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="256" height="256" fill="none" />
        {/* Simple placeholder icon */}
        <circle cx="128" cy="128" r="96" opacity="0.2" />
        <circle cx="128" cy="128" r="96" fill="none" stroke="currentColor" strokeWidth="16" />
      </svg>
    </span>
  )
}

export default Icon
