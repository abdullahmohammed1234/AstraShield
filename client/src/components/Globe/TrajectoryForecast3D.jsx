import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Generate predicted orbital positions based on existing orbit data
const generatePredictedPositions = (satellite, hoursAhead = 24, steps = 100) => {
  if (!satellite || !satellite.orbit || !satellite.orbit.length) return [];
  
  const positions = [];
  const orbit = satellite.orbit;
  const orbitPointsCount = orbit.length;
  
  // Find the current position index in the orbit (closest to satellite's current position)
  const currentPos = { x: satellite.x || 0, y: satellite.y || 0, z: satellite.z || 0 };
  let closestIndex = 0;
  let closestDist = Infinity;
  
  orbit.forEach((point, index) => {
    const dist = Math.sqrt(
      Math.pow(point.x - currentPos.x, 2) +
      Math.pow(point.y - currentPos.y, 2) +
      Math.pow(point.z - currentPos.z, 2)
    );
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = index;
    }
  });
  
  // Simply use all remaining orbit points from current position for the forecast
  // The orbit array already represents the full orbital path
  for (let i = 0; i < steps; i++) {
    // Distribute points evenly across the full orbit
    const orbitIndex = Math.floor((i / steps) * orbitPointsCount);
    const point = orbit[(closestIndex + orbitIndex) % orbitPointsCount];
    
    if (point) {
      positions.push({
        x: point.x || 0,
        y: point.y || 0,
        z: point.z || 0,
        time: (i / steps) * hoursAhead
      });
    }
  }
  
  return positions;
};

// TrajectoryPath component - Animated predicted orbital path
const TrajectoryPath = ({ 
  satellite, 
  color = '#22D3EE', 
  futurePositions = [],
  currentTimeOffset = 0,
  isAnimating = true,
  onPositionUpdate
}) => {
  const lineRef = useRef();
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  const points = useMemo(() => {
    if (!futurePositions || futurePositions.length === 0) return [];
    // Filter out any invalid positions - data is already in correct coordinate system
    return futurePositions
      .filter(pos => pos && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number')
      .map(pos => new THREE.Vector3(pos.x, pos.y, pos.z));
  }, [futurePositions]);
  
  const fullPoints = useMemo(() => {
    if (!satellite || satellite.x === undefined) return [];
    const currentPos = {
      x: satellite.x || 0,
      y: satellite.y || 0,
      z: satellite.z || 0
    };
    // Validate current position
    if (typeof currentPos.x !== 'number' || typeof currentPos.y !== 'number' || typeof currentPos.z !== 'number') {
      return [];
    }
    // Use position directly - data is already in correct coordinate system
    return [new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z), ...points];
  }, [satellite, points]);
  
  // Animation for the path drawing effect - synced with timeOffset
  useFrame((state, delta) => {
    if (isAnimating && fullPoints.length > 0) {
      setAnimatedProgress(prev => {
        const newProgress = prev + delta * 0.15; // Slower animation
        return Math.min(newProgress, 1);
      });
    }
  });
  
  if (fullPoints.length < 2) return null;
  
  // Use timeOffset to determine how much of the path to show (0-24 hours maps to 0-1)
  // Only show the future positions, not the current position
  const timeProgress = Math.min(currentTimeOffset / 24, 1);
  const pointsToShow = Math.max(1, Math.ceil(points.length * timeProgress));
  const visiblePoints = points.slice(0, pointsToShow);
  
  // Ensure we have valid points for the Line component
  if (visiblePoints.length < 2) return null;
  
  return (
    <group>
      {/* Main trajectory line */}
      <Line
        ref={lineRef}
        points={visiblePoints}
        color={color}
        lineWidth={1.5}
        transparent
        opacity={0.6}
      />
      
      {/* Animated particle along the path */}
      {animatedProgress > 0 && visiblePoints.length > 0 && (
        <TrajectoryMarker 
          position={visiblePoints[visiblePoints.length - 1]} 
          color={color}
        />
      )}
    </group>
  );
};

// TrajectoryMarker - Animated dot showing current position on trajectory
const TrajectoryMarker = ({ position, color = '#22D3EE' }) => {
  const markerRef = useRef();
  const glowRef = useRef();
  
  useFrame((state) => {
    if (markerRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 3) * 0.2 + 1;
      markerRef.current.scale.setScalar(pulse);
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3);
    }
  });
  
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

// ConjunctionApproachAnimation - Shows two satellites approaching
const ConjunctionApproachAnimation = ({ 
  satA, 
  satB, 
  conjunction,
  timeOffset = 0,
  isPlaying = true 
}) => {
  const groupRef = useRef();
  const lineRef = useRef();
  const [progress, setProgress] = useState(0);
  
  // Calculate approach positions
  const approachData = useMemo(() => {
    if (!satA || !satB) return null;
    
    const startA = { x: satA.x || 0, y: satA.y || 0, z: satA.z || 0 };
    const startB = { x: satB.x || 0, y: satB.y || 0, z: satB.z || 0 };
    
    // TCA (Time of Closest Approach) - use conjunction data if available
    const TCA = conjunction?.tca ? new Date(conjunction.tca) : new Date(Date.now() + 3600000);
    const now = new Date();
    const timeToTCA = TCA - now;
    
    // If we're past TCA, show recession
    const isReceding = timeToTCA < 0;
    const absTimeToTCA = Math.abs(timeToTCA);
    
    return {
      startA,
      startB,
      distance: conjunction?.missDistance || 1, // km
      timeToTCA,
      isReceding,
      absTimeToTCA
    };
  }, [satA, satB, conjunction]);
  
  useFrame((state, delta) => {
    if (isPlaying && approachData) {
      const timeScale = 0.0001; // Speed of animation
      setProgress(prev => {
        const newProgress = prev + delta * timeScale * (3600000 / (approachData.absTimeToTCA || 3600000));
        return Math.min(newProgress, 1);
      });
    }
  });
  
  if (!approachData) return null;
  
  // Validate positions
  if (!currentA || !currentB || 
      typeof currentA.x !== 'number' || typeof currentA.y !== 'number' || typeof currentA.z !== 'number' ||
      typeof currentB.x !== 'number' || typeof currentB.y !== 'number' || typeof currentB.z !== 'number') {
    return null;
  }
  
  return (
    <group ref={groupRef}>
      {/* Connection line between satellites */}
      <Line
        ref={lineRef}
        points={[
          [currentA.x, currentA.y, currentA.z],
          [currentB.x, currentB.y, currentB.z]
        ]}
        color={getSeparationColor()}
        lineWidth={2}
        transparent
        opacity={0.8}
      />
      
      {/* Distance label */}
      <Html position={[
        (currentA.x + currentB.x) / 2,
        (currentA.y + currentB.y) / 2 + 0.2,
        (currentA.z + currentB.z) / 2
      ]}>
        <div className="glass-card px-2 py-1 rounded text-xs whitespace-nowrap">
          <span style={{ color: getSeparationColor() }}>
            {approachData.distance.toFixed(2)} km
          </span>
        </div>
      </Html>
      
      {/* TCA indicator */}
      <Html position={[0, 2.5, 0]}>
        <div className="glass-card px-3 py-2 rounded text-xs">
          <div className="text-white/70">Time to Closest Approach</div>
          <div className="text-neon-cyan font-mono">
            {approachData.isReceding ? 'Passed' : `${Math.ceil(approachData.absTimeToTCA / 60000)} min`}
          </div>
        </div>
      </Html>
    </group>
  );
};

// TimeSlider component for controlling forecast time
const TimeSlider = ({ 
  value = 0, 
  max = 24, 
  onChange,
  label = 'Forecast Hours Ahead'
}) => {
  const formatTime = (hours) => {
    if (hours === 0) return 'Now';
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };
  
  return (
    <div className="absolute bottom-4 left-4 right-4 glass-card p-4 z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/70 text-sm">{label}</span>
        <span className="text-neon-cyan font-mono text-sm">{formatTime(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer slider"
        style={{
          background: `linear-gradient(to right, #22D3EE 0%, #22D3EE ${(value/max)*100}%, rgba(255,255,255,0.1) ${(value/max)*100}%, rgba(255,255,255,0.1) 100%)`
        }}
      />
      <div className="flex justify-between mt-1 text-xs text-white/30">
        <span>Now</span>
        <span>+{max/2}h</span>
        <span>+{max}h</span>
      </div>
    </div>
  );
};

// Animation controls
const AnimationControls = ({ 
  isPlaying, 
  onPlayPause, 
  speed = 1,
  onSpeedChange,
  onReset 
}) => {
  const speeds = [0.5, 1, 2, 4];
  
  return (
    <div className="absolute top-4 right-4 glass-card p-3 z-10 flex items-center gap-3">
      <button
        onClick={onPlayPause}
        className="w-10 h-10 rounded-full bg-neon-cyan/20 hover:bg-neon-cyan/40 flex items-center justify-center transition-colors"
      >
        {isPlaying ? (
          <span className="text-neon-cyan">⏸</span>
        ) : (
          <span className="text-neon-cyan">▶</span>
        )}
      </button>
      
      <button
        onClick={onReset}
        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <span className="text-white">⟲</span>
      </button>
      
      <div className="flex items-center gap-1">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              speed === s ? 'bg-neon-cyan/40 text-neon-cyan' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
};

// Main TrajectoryForecast3D component
const TrajectoryForecast3D = ({ 
  satellites = [],
  selectedSatellite = null,
  selectedConjunction = null,
  showForecast = true,
  showConjunctionAnimation = true,
  // Props passed from GlobeScene for external control
  timeOffset = 0,
  isPlaying = false,
  animationSpeed = 1,
  onTimeOffsetChange,
  onIsPlayingChange,
  onAnimationSpeedChange
}) => {
  const [internalTimeOffset, setInternalTimeOffset] = useState(0);
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalAnimationSpeed, setInternalAnimationSpeed] = useState(1);
  const [futurePositions, setFuturePositions] = useState({});
  
  // Use external state if provided, otherwise use internal state
  const currentTimeOffset = onTimeOffsetChange ? timeOffset : internalTimeOffset;
  const currentIsPlaying = onIsPlayingChange ? isPlaying : internalIsPlaying;
  const currentSpeed = onAnimationSpeedChange ? animationSpeed : internalAnimationSpeed;
  
  const handleTimeOffsetChange = (value) => {
    if (onTimeOffsetChange) {
      onTimeOffsetChange(value);
    } else {
      setInternalTimeOffset(value);
    }
  };
  
  const handleIsPlayingChange = (value) => {
    if (onIsPlayingChange) {
      onIsPlayingChange(value);
    } else {
      setInternalIsPlaying(value);
    }
  };
  
  const handleAnimationSpeedChange = (value) => {
    if (onAnimationSpeedChange) {
      onAnimationSpeedChange(value);
    } else {
      setInternalAnimationSpeed(value);
    }
  };
  
  // Generate future positions for selected satellite
  useEffect(() => {
    if (selectedSatellite && showForecast) {
      const positions = generatePredictedPositions(selectedSatellite, 24, 100);
      setFuturePositions(prev => ({
        ...prev,
        [selectedSatellite.noradCatId]: positions
      }));
    }
  }, [selectedSatellite, showForecast]);
  
  // Get satellite objects for conjunction
  const satA = useMemo(() => {
    if (!selectedConjunction) return null;
    return satellites.find(s => s.noradCatId === selectedConjunction.satA);
  }, [selectedConjunction, satellites]);
  
  const satB = useMemo(() => {
    if (!selectedConjunction) return null;
    return satellites.find(s => s.noradCatId === selectedConjunction.satB);
  }, [selectedConjunction, satellites]);
  
  // Animation loop
  useFrame((state, delta) => {
    if (currentIsPlaying && showForecast) {
      handleTimeOffsetChange(prev => {
        const newOffset = prev + delta * currentSpeed;
        return Math.min(newOffset, 24); // Max 24 hours ahead
      });
    }
  });
  
  // Get current interpolated position based on time offset
  const getCurrentPosition = (satellite, offset) => {
    if (!satellite || !futurePositions[satellite.noradCatId]) {
      return { x: satellite?.x || 0, y: satellite?.y || 0, z: satellite?.z || 0 };
    }
    
    const positions = futurePositions[satellite.noradCatId];
    const index = Math.min(Math.floor((offset / 24) * positions.length), positions.length - 1);
    const pos = positions[index] || positions[0];
    
    return { x: pos?.x || 0, y: pos?.y || 0, z: pos?.z || 0 };
  };
  
  const handlePlayPause = () => handleIsPlayingChange(!currentIsPlaying);
  
  const handleReset = () => {
    handleIsPlayingChange(false);
    handleTimeOffsetChange(0);
  };
  
  return (
    <group>
      {/* Trajectory paths for selected satellite */}
      {showForecast && selectedSatellite && futurePositions[selectedSatellite.noradCatId] && (
        <TrajectoryPath
          satellite={selectedSatellite}
          futurePositions={futurePositions[selectedSatellite.noradCatId]}
          currentTimeOffset={currentTimeOffset}
          isAnimating={currentIsPlaying}
          color="#22D3EE"
        />
      )}
      
      {/* Conjunction approach animation */}
      {showConjunctionAnimation && selectedConjunction && satA && satB && (
        <ConjunctionApproachAnimation
          satA={satA}
          satB={satB}
          conjunction={selectedConjunction}
          timeOffset={currentTimeOffset}
          isPlaying={currentIsPlaying}
        />
      )}
    </group>
  );
};

export default TrajectoryForecast3D;
export { TimeSlider, AnimationControls, TrajectoryPath, ConjunctionApproachAnimation };
