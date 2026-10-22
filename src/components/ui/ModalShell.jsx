import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Compound Modal Shell
 */
export function ModalShell({
  isOpen = true,
  onClose,
  closeOnOutsideClick = true,
  closeOnEscape = true,
  className = '',
  maxWidth = '520px',
  children,
  ariaLabel,
  ...rest
}) {
  const modalRef = useRef(null);
  const pointerDownTarget = useRef(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const handlePointerDown = (e) => {
    pointerDownTarget.current = e.target;
  };

  const handleBackdropClick = (e) => {
    if (
      closeOnOutsideClick &&
      onClose &&
      e.target === e.currentTarget &&
      pointerDownTarget.current === e.currentTarget
    ) {
      onClose();
    }
  };

  return (
    <div
      className="ui-modal-overlay overlay-bg"
      onPointerDown={handlePointerDown}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`ui-modal-shell ${className}`.trim()}
        style={{ maxWidth }}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}

function Header({ title, icon, onClose, children, className = '' }) {
  return (
    <div className={`ui-modal-header ${className}`.trim()}>
      <div className="ui-modal-header-title-row">
        {icon && <span className="ui-modal-header-icon">{icon}</span>}
        {title && <h3 className="ui-modal-title">{title}</h3>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ui-modal-close-btn"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}

function Body({ children, className = '', ...rest }) {
  return (
    <div className={`ui-modal-body ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

function Footer({ children, align = 'right', className = '', ...rest }) {
  return (
    <div className={`ui-modal-footer ui-modal-footer-${align} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

ModalShell.Header = Header;
ModalShell.Body = Body;
ModalShell.Footer = Footer;
