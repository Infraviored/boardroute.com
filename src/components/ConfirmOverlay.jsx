import React from 'react';
import { MOBILE_MQ } from '../mobile.js';
import { ModalShell, Button } from './ui';

export function ConfirmOverlay({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="380px"
      ariaLabel={title || 'Confirm action'}
      className="confirm-modal-shell"
    >
      <ModalShell.Header
        title={title || 'Confirm action'}
        onClose={onCancel}
      />

      <ModalShell.Body>
        <p className="confirm-modal-message">
          {message || 'Are you sure you want to proceed?'}
        </p>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Confirm action
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
          font-size: 0.9em;
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
