import React from 'react';

/**
 * Standard UI Button component
 * @param {Object} props
 * @param {'primary' | 'secondary' | 'danger' | 'accent' | 'purple' | 'ghost'} [props.variant='secondary']
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {React.ReactNode} [props.icon]
 * @param {React.ReactNode} [props.iconRight]
 * @param {boolean} [props.fullWidth=false]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className='']
 * @param {string} [props.type='button']
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...rest
}) {
  const variantClass = `ui-btn-${variant}`;
  const sizeClass = `ui-btn-${size}`;
  const widthClass = fullWidth ? 'ui-btn-full' : '';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`ui-btn ${variantClass} ${sizeClass} ${widthClass} ${className}`.trim()}
      {...rest}
    >
      {icon && <span className="ui-btn-icon">{icon}</span>}
      {children && <span className="ui-btn-text">{children}</span>}
      {iconRight && <span className="ui-btn-icon-right">{iconRight}</span>}
    </button>
  );
}
