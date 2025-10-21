import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react';

import { useEffect, useState } from 'react';

export function Background() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fade in after component mounts with a slight delay for smoother transition
    const timer = setTimeout(() => setLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="transition-opacity duration-1000 ease-in-out"
      style={{ opacity: loaded ? 1 : 0 }}
    >
      <ShaderGradientCanvas
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
        lazyLoad={true}
        fov={undefined}
        pixelDensity={1}
        pointerEvents="none"
      >
        <ShaderGradient
          animate="on"
          type="sphere"
          wireframe={false}
          shader="defaults"
          uTime={0}
          uSpeed={0.3}
          uStrength={0.3}
          uDensity={0.8}
          uFrequency={2.7}
          uAmplitude={5}
          positionX={-0.1}
          positionY={0}
          positionZ={0}
          rotationX={0}
          rotationY={130}
          rotationZ={70}
          color1="#f14e32"
          color2="#0388a6"
          color3="#000"
          reflection={0.4}
          // View (camera) props
          cAzimuthAngle={270}
          cPolarAngle={180}
          cDistance={0.5}
          cameraZoom={15.1}
          // Effect props
          lightType="env"
          brightness={1}
          envPreset="city"
          grain="on"
          // Tool props
          toggleAxis={false}
          zoomOut={false}
          hoverState=""
          // Optional - if using transition features
          enableTransition={false}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
