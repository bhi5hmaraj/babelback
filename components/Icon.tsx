
import React from 'react';

// Using Phosphor Icons class names
// Ensure you have included the Phosphor Icons CSS in your index.html
// <link href="https://unpkg.com/@phosphor-icons/web@2.0.3/src/css/phosphor.css" rel="stylesheet">


interface IconProps {
  name: string; // Phosphor icon name, e.g., "play", "gear", "translate"
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, weight = 'regular', size = 'base', className = '' }) => {
  const sizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl',
    '5xl': 'text-5xl',
    '6xl': 'text-6xl',
  };

  const weightClass = weight === 'regular' ? '' : `ph-${weight}`;

  return (
    <i className={`ph ${weightClass} ph-${name} ${sizeMap[size]} ${className}`} />
  );
};

export default Icon;
