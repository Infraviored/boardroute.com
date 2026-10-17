import React from 'react';

/**
 * Standard Section Label component
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className='']
 * @param {React.ReactNode} [props.action] Optional right-aligned action or badge
 */
export function SectionLabel({ children, className = '', action, ...rest }) {
  return (
    <div className={`ui-section-label-row ${className}`.trim()} {...rest}>
      <span className="ui-section-label">{children}</span>
      {action && <span className="ui-section-label-action">{action}</span>}
    </div>
  );
}
