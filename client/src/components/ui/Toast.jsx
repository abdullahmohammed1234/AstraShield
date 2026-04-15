import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

// Toast types and their corresponding colors
const toastStyles = {
  success: {
    bg: 'bg-green-500/90',
    border: 'border-green-400',
    icon: '✓'
  },
  error: {
    bg: 'bg-red-500/90',
    border: 'border-red-400',
    icon: '✕'
  },
  warning: {
    bg: 'bg-yellow-500/90',
    border: 'border-yellow-400',
    icon: '⚠'
  },
  info: {
    bg: 'bg-blue-500/90',
    border: 'border-blue-400',
    icon: 'ℹ'
  }
};

// Toast component
const Toast = ({ id, type, message, onClose }) => {
  const style = toastStyles[type] || toastStyles.info;
  
  return (
    <div 
      className={`
        ${style.bg} text-white px-4 py-3 rounded-lg shadow-lg 
        border ${style.border} flex items-center gap-3
        transform transition-all duration-300 ease-in-out
        animate-slide-in
        min-w-[300px] max-w-md
      `}
      role="alert"
    >
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 font-bold">
        {style.icon}
      </span>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button 
        onClick={() => onClose(id)}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
};

// Toast container
const ToastContainer = ({ toasts, onClose }) => {
  if (!toasts || toasts.length === 0) return null;
  
  return (
    <div 
      className="fixed top-20 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <Toast 
          key={toast.id} 
          {...toast} 
          onClose={onClose}
        />
      ))}
    </div>
  );
};

// Provider component
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message, duration = 5000) => {
    const id = Date.now() + Math.random();
    
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Convenience methods
  const toast = {
    success: (message, duration) => addToast('success', message, duration),
    error: (message, duration) => addToast('error', message, duration),
    warning: (message, duration) => addToast('warning', message, duration),
    info: (message, duration) => addToast('info', message, duration),
  };

  return (
    <ToastContext.Provider value={{ toast, addToast, removeToast }}>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {children}
    </ToastContext.Provider>
  );
};

// Custom hook to use toast
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a no-op function if used outside provider
    return {
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {}
    };
  }
  return context;
};

export default ToastContext;
