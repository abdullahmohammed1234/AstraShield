import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const OrbitPath = ({ orbitData, color = '#22D3EE', opacity = 0.3 }) => {
  const lineRef = useRef();

  const points = useMemo(() => {
    if (!orbitData || orbitData.length === 0) return [];

    return orbitData.map(point => 
      new THREE.Vector3(point.x, point.z, point.y)
    );
  }, [orbitData]);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  if (!geometry) return null;

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        linewidth={1}
      />
    </line>
  );
};

export default OrbitPath;
