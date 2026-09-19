"use client";

import { useState } from "react";
import { CursorRipples, FractalNoise, Shader, Swirl, Watercolor } from "shaders/react";

export default function HeroShaderCanvas({ className }: { className?: string }) {
  const [ready, setReady] = useState(false);
  return (
    <Shader
      className={className}
      toneMapping="cineon"
      disableTelemetry
      data-ready={ready || undefined}
      onReady={() => setReady(true)}
      onUnavailable={() => setReady(false)}
      aria-hidden="true"
    >
      <Swirl
        colorSpace="oklab"
        detail={0.6}
        stops={[
          { color: "#225fa6", position: 0 },
          { color: "#2f6fb3", position: 0.18 },
          { color: "#5f94d1", position: 0.38 },
          { color: "#97aed6", position: 0.62 },
          { color: "#d1b8af", position: 0.82 },
          { color: "#dea48b", position: 1 },
        ]}
      />
      <FractalNoise
        angle={-137}
        blendMode="softLight"
        contrast={0.19}
        detail={1.9}
        octaves={1}
        opacity={0.4}
        speed={0.57}
        stops={[
          { color: "#000000", position: 0 },
          { color: "#ffffff", position: 1 },
        ]}
      />
      <CursorRipples chromaticSplit={0} decay={3.3} intensity={17.4} radius={1} />
      <Watercolor bleed={2.9} paper={0.07} />
    </Shader>
  );
}
