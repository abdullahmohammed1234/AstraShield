/**
 * Skeleton loader components for better perceived performance
 * These replace traditional spinners with content-shaped placeholders
 */

// Base skeleton component with shimmer animation
export const Skeleton = ({ className = '', variant = 'rectangular' }) => {
  const variantClasses = {
    rectangular: 'rounded',
    circular: 'rounded-full',
    text: 'rounded h-4'
  };

  return (
    <div 
      className={`
        ${variantClasses[variant]}
        bg-gradient-to-r from-white/5 via-white/10 to-white/5
        bg-[length:200%_100%] animate-shimmer
        ${className}
      `}
    />
  );
};

// Text skeleton with configurable lines
export const SkeletonText = ({ lines = 3, className = '' }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          variant="text" 
          className={`w-${i === lines - 1 ? '3/4' : 'full'}`}
          style={{ width: i === lines - 1 ? '75%' : '100%' }}
        />
      ))}
    </div>
  );
};

// Card skeleton for loading cards
export const SkeletonCard = ({ hasImage = true, title = true, content = true, actions = false }) => {
  return (
    <div className="glass-card p-4 space-y-4">
      {hasImage && (
        <Skeleton className="w-full h-32" />
      )}
      {title && (
        <Skeleton className="w-3/4 h-6" />
      )}
      {content && (
        <SkeletonText lines={2} />
      )}
      {actions && (
        <div className="flex gap-2">
          <Skeleton className="w-20 h-8" variant="rectangular" />
          <Skeleton className="w-20 h-8" variant="rectangular" />
        </div>
      )}
    </div>
  );
};

// Table skeleton
export const SkeletonTable = ({ rows = 5, columns = 4 }) => {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-4" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="flex-1 h-8" />
          ))}
        </div>
      ))}
    </div>
  );
};

// List skeleton
export const SkeletonList = ({ items = 5, avatar = true }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="w-10 h-10" variant="circular" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="w-1/3 h-4" />
            <Skeleton className="w-1/2 h-3" />
          </div>
        </div>
      ))}
    </div>
  );
};

// Chart skeleton
export const SkeletonChart = ({ bars = 6 }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2 h-40">
        {Array.from({ length: bars }).map((_, i) => (
          <Skeleton 
            key={i} 
            className="flex-1" 
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {Array.from({ length: bars }).map((_, i) => (
          <Skeleton key={i} className="w-8 h-3" />
        ))}
      </div>
    </div>
  );
};

// Globe/3D placeholder skeleton
export const SkeletonGlobe = () => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-deep-space/30 rounded-lg">
      <div className="text-center">
        <Skeleton className="w-24 h-24 mx-auto mb-4" variant="circular" />
        <Skeleton className="w-48 h-4 mx-auto mb-2" />
        <Skeleton className="w-32 h-3 mx-auto" />
      </div>
    </div>
  );
};

// Statistics card skeleton
export const SkeletonStatCard = () => {
  return (
    <div className="glass-card p-4">
      <Skeleton className="w-12 h-12 mb-3" variant="circular" />
      <Skeleton className="w-8 h-6 mb-2" />
      <Skeleton className="w-16 h-4" />
    </div>
  );
};

// Page skeleton - full page loading state
export const SkeletonPage = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <Skeleton className="w-48 h-8" />
        <Skeleton className="w-24 h-10" />
      </div>
      
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
      
      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonCard hasImage={false} />
        </div>
        <div>
          <SkeletonList items={4} />
        </div>
      </div>
    </div>
  );
};

// Conjunction panel skeleton
export const SkeletonConjunctionPanel = () => {
  return (
    <div className="glass-card p-4">
      <Skeleton className="w-40 h-6 mb-4" />
      <SkeletonList items={5} />
    </div>
  );
};

// Alert item skeleton
export const SkeletonAlertItem = () => {
  return (
    <div className="glass-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="w-4 h-4 mt-1" variant="circular" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-3/4 h-5" />
          <Skeleton className="w-1/2 h-4" />
          <Skeleton className="w-1/3 h-3" />
        </div>
      </div>
    </div>
  );
};

// Data grid skeleton
export const SkeletonDataGrid = ({ rows = 8 }) => {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-4 gap-4 p-2">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="glass-card p-2">
          <div className="grid grid-cols-4 gap-4">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
