import React from 'react';

export function ConfirmOverlay({ isOpen, title, message, onConfirm, onCancel }) {
    if (!isOpen) return null;

    return (
        <div className="overlay-bg">
            <div className="modal confirm-modal">
                <div className="modal-header">
                    <h3>{title || 'Confirm Action'}</h3>
                    <button className="close-btn" onClick={onCancel}>✕</button>
                </div>

                <div className="modal-body">
                    <p style={{ fontSize: '0.95em', color: 'var(--txt1)', lineHeight: '1.5', margin: '10px 0 20px 0' }}>
                        {message || 'Are you sure you want to proceed?'}
                    </p>
                </div>

                <div className="modal-footer">
                    <button className="c-btn cancel" onClick={onCancel}>Cancel</button>
                    <button className="c-btn danger" onClick={onConfirm}>Confirm Action</button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .confirm-modal { 
                  max-width: 380px; 
                  width: 95%; 
                  background: var(--glass-bg);
                  backdrop-filter: blur(20px);
                  border: 1px solid var(--border2);
                  box-shadow: var(--shadow-premium), 0 0 40px rgba(0,0,0,0.4);
                  padding: 32px;
                }
                .modal-header h3 {
                  font-family: 'Outfit', sans-serif;
                  font-size: 1.25em;
                  letter-spacing: -0.02em;
                  color: #fff;
                }
                .modal-body p {
                  font-family: 'Inter', sans-serif;
                  font-size: 0.9em;
                  color: var(--txt1);
                  line-height: 1.6;
                  margin: 16px 0 28px 0;
                }
                .modal-footer {
                  display: flex;
                  gap: 12px;
                  justify-content: flex-end;
                }
                .c-btn {
                  padding: 10px 24px;
                  border-radius: 10px;
                  font-size: 0.85em;
                  font-weight: 700;
                  font-family: 'Inter', sans-serif;
                  cursor: pointer;
                  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                  border: 1px solid transparent;
                }
                .c-btn.cancel {
                  background: var(--bg4);
                  border-color: var(--border);
                  color: var(--txt1);
                }
                .c-btn.cancel:hover {
                  background: var(--bg3);
                  color: #fff;
                  border-color: var(--border2);
                }
                .c-btn.danger {
                  background: rgba(248, 81, 73, 0.15);
                  border-color: rgba(248, 81, 73, 0.3);
                  color: #f85149;
                }
                .c-btn.danger:hover {
                  background: #f85149;
                  color: #fff;
                  transform: translateY(-1px);
                  box-shadow: 0 4px 12px rgba(248, 81, 73, 0.3);
                }

                @media (max-width: 768px) {
                  .confirm-modal {
                    width: calc(100vw - 32px);
                    padding: 24px 18px;
                  }
                  .confirm-modal .close-btn {
                    width: 40px;
                    height: 40px;
                    min-width: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .modal-footer {
                    flex-direction: column-reverse;
                    gap: 8px;
                  }
                  .c-btn {
                    width: 100%;
                    min-height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.95rem;
                  }
                }
                `
            }} />
        </div>
    );
}
