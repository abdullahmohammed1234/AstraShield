import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Preload } from '@react-three/drei';
import Earth from './Earth';
import Satellite from './Satellite';
import OrbitPath from './OrbitPath';

const StarsBackground = () => {
  return (
    <Stars
      radius={100}
      depth={50}
      count={5000}
      factor={4}
      saturation={0}
      fade
      speed={0.5}
    />
  );
};

const GlobeScene = ({ 
  satellites = [], 
  selectedSatellite = null,
  onSatelliteClick = () => {},
  selectedConjunction = null,
  autoRotate = true,
  showOrbits = false
}) => {
  const displaySatellites = useMemo(() => {
    return satellites.slice(0, 300);
  }, [satellites]);

  const selectedOrbit = useMemo(() => {
    if (!selectedSatellite || !selectedSatellite.orbit) return null;
    return selectedSatellite.orbit;
  }, [selectedSatellite]);

  const highlightedSatIds = useMemo(() => {
    if (!selectedConjunction) return new Set();
    return new Set([selectedConjunction.satA, selectedConjunction.satB]);
  }, [selectedConjunction]);

  const conjunctionLine = useMemo(() => {
    if (!selectedConjunction) return null;
    
    const satA = satellites.find(s => s.noradCatId === selectedConjunction.satA);
    const satB = satellites.find(s => s.noradCatId === selectedConjunction.satB);
    
    if (satA && satB && satA.x !== undefined && satB.x !== undefined) {
      return {
        start: [satA.x, satA.y, satA.z],
        end: [satB.x, satB.y, satB.z]
      };
    }
    return null;
  }, [selectedConjunction, satellites]);

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color="#22D3EE" />
          
          <StarsBackground />
          
          <Earth autoRotate={autoRotate} rotationSpeed={0.0005} />
          
          {displaySatellites.map((sat) => (
            <Satellite
              key={sat.noradCatId || sat.name}
              position={{
                x: sat.x || 0,
                y: sat.y || 0,
                z: sat.z || 0
              }}
              riskScore={sat.riskScore || 0}
              name={sat.name}
              onClick={() => onSatelliteClick(sat)}
              isHighlighted={highlightedSatIds.has(sat.noradCatId)}
              riskLevel={highlightedSatIds.has(sat.noradCatId) ? selectedConjunction?.riskLevel : null}
            />
          ))}

          {conjunctionLine && (
            <group>
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    count={2}
                    array={new Float32Array([...conjunctionLine.start, ...conjunctionLine.end])}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#EF4444" linewidth={2} transparent opacity={0.8} />
              </line>
            </group>
          )}

          {showOrbits && selectedOrbit && (
            <OrbitPath 
              orbitData={selectedOrbit} 
              color="#22D3EE" 
              opacity={0.5}
            />
          )}
          
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={3}
            maxDistance={15}
            autoRotate={false}
          />
          
          <Preload all />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default GlobeScene;
