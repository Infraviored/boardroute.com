import React from 'react';

/**
 * Standard UI IconButton component
 * @param {Object} props
 * @param {React.ReactNode} props.icon
 * @param {string} props.label
 * @param {'ghost' | 'secondary' | 'danger'} [props.variant='ghost']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className='']
 * @param {string} [props.type='button']
 */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...rest
}) {
  const variantClass = `ui-icn-btn-${variant}`;
  const sizeClass = `ui-icn-btn-${size}`;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`ui-icn-btn ${variantClass} ${sizeClass} ${className}`.trim()}
      {...rest}
    >
      {icon}
    </button>
  );
}
