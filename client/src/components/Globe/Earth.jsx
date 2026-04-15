import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const Earth = ({ autoRotate = true, rotationSpeed = 0.001 }) => {
  const earthRef = useRef();
  const atmosphereRef = useRef();

  const earthTexture = useMemo(() => {
    return new THREE.TextureLoader().load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
    );
  }, []);

  const bumpTexture = useMemo(() => {
    return new THREE.TextureLoader().load(
      'https://unpkg.com/three-globe/example/img/earth-topology.png'
    );
  }, []);

  useFrame(() => {
    if (earthRef.current && autoRotate) {
      earthRef.current.rotation.y += rotationSpeed;
    }
    if (atmosphereRef.current && autoRotate) {
      atmosphereRef.current.rotation.y += rotationSpeed;
    }
  });

  return (
    <group>
      <mesh ref={earthRef} name="Earth">
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial
          map={earthTexture}
          bumpMap={bumpTexture}
          bumpScale={0.05}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>
      
      <mesh ref={atmosphereRef} name="Atmosphere">
        <sphereGeometry args={[2.08, 64, 64]} />
        <meshPhongMaterial
          color="#22D3EE"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh name="AtmosphereGlow">
        <sphereGeometry args={[2.15, 64, 64]} />
        <meshPhongMaterial
          color="#22D3EE"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
};

export default Earth;
