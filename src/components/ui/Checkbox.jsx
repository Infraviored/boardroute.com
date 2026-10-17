import React from 'react';
import { Check } from 'lucide-react';

/**
 * Standard UI Checkbox component
 * @param {Object} props
 * @param {boolean} props.checked
 * @param {(checked: boolean) => void} props.onChange
 * @param {string} [props.label]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className='']
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  id,
  ...rest
}) {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  return (
    <label
      htmlFor={inputId}
      className={`ui-checkbox-label ${disabled ? 'disabled' : ''} ${className}`.trim()}
    >
      <span className="ui-checkbox-box-wrapper">
        <input
          type="checkbox"
          id={inputId}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange && onChange(e.target.checked)}
          className="ui-checkbox-input"
          {...rest}
        />
        <span className={`ui-checkbox-box ${checked ? 'checked' : ''}`}>
          {checked && <Check size={12} strokeWidth={3} className="ui-checkbox-check" />}
        </span>
      </span>
      {label && <span className="ui-checkbox-text">{label}</span>}
    </label>
  );
}
