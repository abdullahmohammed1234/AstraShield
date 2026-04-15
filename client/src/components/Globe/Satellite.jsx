import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const getRiskColor = (riskScore) => {
  if (riskScore < 0.3) return '#22D3EE';
  if (riskScore < 0.6) return '#F59E0B';
  return '#EF4444';
};

const Satellite = ({ position, riskScore = 0, name, onClick, isHighlighted = false, riskLevel = null }) => {
  const meshRef = useRef();
  const glowRef = useRef();
  const [hovered, setHovered] = useState(false);
  
  const getColor = () => {
    if (isHighlighted) {
      return riskLevel === 'critical' ? '#FF0000' : '#EF4444';
    }
    return getRiskColor(riskScore);
  };
  
  const color = getColor();
  const baseScale = isHighlighted ? 2 : 1;
  const glowIntensity = isHighlighted ? 0.6 : 0.3;

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(hovered ? baseScale * 1.5 : baseScale);
      
      if (isHighlighted && riskLevel === 'critical') {
        const pulse = Math.sin(state.clock.elapsedTime * 4) * 0.5 + 0.5;
        meshRef.current.scale.setScalar(baseScale * (1 + pulse * 0.3));
      }
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(hovered ? baseScale * 2.5 : baseScale * 2);
    }
  });

  const positionArray = [position.x, position.y, position.z];

  return (
    <group position={positionArray}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick && onClick();
        }}
      >
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <mesh
        ref={glowRef}
      >
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={glowIntensity}
        />
      </mesh>

      {hovered && name && (
        <Html
          position={[0, 0.1, 0]}
          center
          style={{
            pointerEvents: 'none'
          }}
        >
          <div className="glass-card px-3 py-2 rounded-lg whitespace-nowrap">
            <p className="text-xs font-medium text-white">{name}</p>
            <p className="text-xs" style={{ color }}>
              Risk: {(riskScore * 100).toFixed(1)}%
            </p>
          </div>
        </Html>
      )}
    </group>
  );
};

export default Satellite;
