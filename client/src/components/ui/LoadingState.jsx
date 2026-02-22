import { SkeletonPage, SkeletonCard, SkeletonList, SkeletonTable, SkeletonChart, SkeletonConjunctionPanel, SkeletonDataGrid, SkeletonAlertItem, SkeletonStatCard } from './Skeleton';

/**
 * Loading state wrapper that shows skeleton loaders while content is loading
 * Replaces traditional spinner loading for better perceived performance
 */

// Generic loading wrapper
export const LoadingWrapper = ({ isLoading, isError, error, children, skeleton, onRetry }) => {
  if (isLoading) {
    return skeleton || <SkeletonPage />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-alert-red/20 flex items-center justify-center">
            <span className="text-3xl">⚠</span>
          </div>
          <p className="text-alert-red mb-4">
            {error?.message || 'Failed to load data'}
          </p>
          {onRetry && (
            <button onClick={onRetry} className="neon-button">
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return children;
};

// Specific loading components for different content types
export const LoadingCard = ({ isLoading, children, className = '' }) => {
  if (isLoading) {
    return (
      <div className={className}>
        <SkeletonCard hasImage={false} title content actions />
      </div>
    );
  }
  return children;
};

export const LoadingList = ({ isLoading, count = 5, children }) => {
  if (isLoading) {
    return <SkeletonList items={count} />;
  }
  return children;
};

export const LoadingTable = ({ isLoading, rows = 5, columns = 4, children }) => {
  if (isLoading) {
    return <SkeletonTable rows={rows} columns={columns} />;
  }
  return children;
};

export const LoadingChart = ({ isLoading, children }) => {
  if (isLoading) {
    return <SkeletonChart />;
  }
  return children;
};

export const LoadingDataGrid = ({ isLoading, rows = 8, children }) => {
  if (isLoading) {
    return <SkeletonDataGrid rows={rows} />;
  }
  return children;
};

export const LoadingAlertList = ({ isLoading, count = 5, children }) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonAlertItem key={i} />
        ))}
      </div>
    );
  }
  return children;
};

// Statistics loading
export const LoadingStats = ({ isLoading, children }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
    );
  }
  return children;
};

// Conjunction panel loading
export const LoadingConjunctionPanel = ({ isLoading, children }) => {
  if (isLoading) {
    return <SkeletonConjunctionPanel />;
  }
  return children;
};

// Dashboard loading - full dashboard skeleton
export const LoadingDashboard = () => {
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="glass-card p-4 h-[600px] relative">
              <div className="w-full h-full flex items-center justify-center bg-deep-space/30 rounded-lg">
                <div className="text-center">
                  <SkeletonCard hasImage={false} />
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <SkeletonConjunctionPanel />
            
            <div className="glass-card p-4">
              <SkeletonBase className="w-40 h-6 mb-4" />
              <SkeletonList items={3} avatar={false} />
            </div>
            
            <div className="glass-card p-4">
              <SkeletonBase className="w-40 h-6 mb-4" />
              <SkeletonList items={3} avatar={false} />
            </div>
            
            <div className="glass-card p-4">
              <SkeletonBase className="w-40 h-6 mb-4" />
              <SkeletonList items={3} avatar={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingWrapper;
