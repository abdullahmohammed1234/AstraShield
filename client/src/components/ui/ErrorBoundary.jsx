import { Component } from 'react';
import { useToast } from './Toast';

/**
 * Error Boundary component for catching React errors gracefully
 * Provides fallback UI and error recovery options
 */
class ErrorBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    
    // Log error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    // If there's a reset function, call it
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const { 
        fallback = null, 
        title = 'Something went wrong',
        message = 'An unexpected error occurred. Please try again.',
        showRetry = true,
        showReset = false
      } = this.props;

      // Custom fallback if provided
      if (fallback) {
        return fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          retry: this.handleRetry,
          reset: this.handleReset
        });
      }

      // Default fallback UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="glass-card p-8 max-w-lg w-full text-center">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-alert-red/20 flex items-center justify-center">
                <span className="text-3xl">⚠</span>
              </div>
              <h2 className="text-xl font-orbitron font-semibold text-white mb-2">
                {title}
              </h2>
              <p className="text-white/70 text-sm">
                {message}
              </p>
            </div>

            {/* Error details in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-deep-space/50 rounded-lg text-left overflow-auto max-h-40">
                <p className="text-alert-red text-xs font-mono">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-white/50 text-xs mt-2 overflow-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              {showRetry && (
                <button
                  onClick={this.handleRetry}
                  className="neon-button"
                >
                  Try Again
                </button>
              )}
              {showReset && (
                <button
                  onClick={this.handleReset}
                  className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper component to use hooks inside ErrorBoundary
export const ErrorBoundary = ({ children, ...props }) => {
  const toast = useToast();
  
  const handleError = (error, errorInfo) => {
    // Show toast notification on error
    toast.error('An error occurred. Please try again.');
  };

  return (
    <ErrorBoundaryClass {...props} onError={handleError}>
      {children}
    </ErrorBoundaryClass>
  );
};

/**
 * Higher-order component for wrapping components with error boundary
 */
export const withErrorBoundary = (ComponentToWrap, errorBoundaryProps = {}) => {
  const WithErrorBoundary = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <ComponentToWrap {...props} />
    </ErrorBoundary>
  );
  
  WithErrorBoundary.displayName = `WithErrorBoundary(${ComponentToWrap.displayName || ComponentToWrap.name || 'Component'})`;
  return WithErrorBoundary;
};

/**
 * Hook for async error handling in components
 */
export const useErrorHandler = () => {
  const toast = useToast();
  
  const handleError = (error) => {
    console.error('Error handled:', error);
    
    let message = 'An unexpected error occurred';
    if (error.response) {
      // Server responded with error
      message = error.response.data?.error || error.response.data?.message || `Server error: ${error.response.status}`;
    } else if (error.request) {
      // Request made but no response
      message = 'Unable to connect to server. Please check your connection.';
    } else if (error.message) {
      message = error.message;
    }
    
    toast.error(message);
    return error;
  };

  return { handleError };
};

export default ErrorBoundary;
