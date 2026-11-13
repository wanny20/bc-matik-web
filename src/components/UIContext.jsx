import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react';
import './FeedbackUI.css';

const UIContext = createContext();

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = useCallback((message, type = 'success', title = '') => {
    const id = Date.now() + Math.random();
    const defaultTitle = 
      title || (type === 'success' ? 'Success' : type === 'error' ? 'Action Failed' : 'Notice');

    setToasts((prev) => [...prev, { id, message, type, title: defaultTitle }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const confirmAction = useCallback(({ 
    title = 'Confirm Action', 
    message = 'Are you sure you want to proceed?', 
    confirmText = 'Confirm', 
    cancelText = 'Cancel',
    variant = 'danger',
    onConfirm 
  }) => {
    setConfirmDialog({
      title,
      message,
      confirmText,
      cancelText,
      variant,
      onConfirm: async () => {
        setConfirmDialog(null);
        if (onConfirm) await onConfirm();
      }
    });
  }, []);

  const closeConfirm = () => setConfirmDialog(null);

  return (
    <UIContext.Provider value={{ showToast, confirmAction }}>
      {children}

      {/* Top-Right Floating Toasts Container */}
      <div className="quest-toast-Viewport">
        {toasts.map((t) => (
          <div key={t.id} className={`quest-toast toast-${t.type}`}>
            <div className="quest-toast-icon">
              {t.type === 'success' && <CheckCircle2 size={20} color="#16A34A" />}
              {t.type === 'error' && <AlertCircle size={20} color="#DC2626" />}
              {t.type === 'warning' && <AlertTriangle size={20} color="#D97706" />}
            </div>
            <div className="quest-toast-content">
              <div className="quest-toast-title">{t.title}</div>
              <p className="quest-toast-message">{t.message}</p>
            </div>
            <button onClick={() => dismissToast(t.id)} className="quest-toast-close">
              <X size={16} />
            </button>
            <div className="quest-toast-progress-track">
              <div className="quest-toast-progress-bar" />
            </div>
          </div>
        ))}
      </div>

      {/* Global Confirmation Modal */}
      {confirmDialog && (
        <div className="quest-modal-backdrop" onClick={closeConfirm}>
          <div className="quest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className={`quest-modal-icon-badge ${confirmDialog.variant}`}>
                <AlertTriangle size={22} />
              </div>
              <h3 className="quest-modal-title" style={{ flex: 1 }}>{confirmDialog.title}</h3>
              <button onClick={closeConfirm} className="quest-toast-close">
                <X size={18} />
              </button>
            </div>

            <p className="quest-modal-desc" style={{ marginTop: '16px' }}>{confirmDialog.message}</p>

            <div className="quest-modal-actions">
              <button onClick={closeConfirm} className="quest-btn quest-btn-outline">
                {confirmDialog.cancelText}
              </button>
              <button 
                onClick={confirmDialog.onConfirm} 
                className={`quest-btn ${confirmDialog.variant === 'danger' ? 'quest-btn-danger' : 'quest-btn-primary'}`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);