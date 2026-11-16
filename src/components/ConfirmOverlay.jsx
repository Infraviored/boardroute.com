import React from 'react';
import { MOBILE_MQ } from '../mobile.js';
import { ModalShell, Button } from './ui';

export function ConfirmOverlay({ isOpen, title, message, action, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="440px"
      ariaLabel={title || 'Confirm'}
      className="confirm-modal-shell"
    >
      <ModalShell.Header
        title={title || 'Confirm'}
        onClose={onCancel}
      />

      <ModalShell.Body>
        <p className="confirm-modal-message">
          {message || ''}
        </p>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {action || 'Confirm'}
        </Button>
      </ModalShell.Footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .confirm-modal-shell {
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          border: 1px solid var(--border2);
          box-shadow: var(--shadow-premium), 0 0 40px rgba(0, 0, 0, 0.4);
        }
        .confirm-modal-message {
          font-family: 'Inter', sans-serif;
          font-size: var(--fs-15);
          color: var(--txt1);
          line-height: 1.6;
          margin: 6px 0 16px 0;
        }
        @media ${MOBILE_MQ} {
          .confirm-modal-shell {
            width: calc(100vw - 32px);
          }
          .confirm-modal-shell .ui-modal-footer {
            flex-direction: column-reverse;
            gap: 8px;
          }
          .confirm-modal-shell .ui-btn {
            width: 100%;
            min-height: 44px;
          }
        }
        `
      }} />
    </ModalShell>
  );
}
