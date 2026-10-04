import React from 'react';

interface InkWaveRibbonProps {
  className?: string;
}

/**
 * InkWaveRibbon (东方水墨波纹与宣纸竹帘纹样)
 * Replicates the elegant oriental ink wash undulating waves with fine paper grain
 * as requested from user reference image (IMG_20261001_005307.jpg).
 */
export const InkWaveRibbon: React.FC<InkWaveRibbonProps> = ({ className = '' }) => {
  return (
    <div
      className={`relative w-full overflow-hidden select-none pointer-events-none transition-all duration-300 z-10 shrink-0 h-[26px] sm:h-[32px] md:h-[38px] ${className}`}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full block"
        viewBox="0 0 1440 90"
        fill="none"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* 细腻竹帘宣纸网格微孔纹理 (Delicate woven linen paper grid texture) */}
          <pattern
            id="ink-paper-mesh"
            x="0"
            y="0"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill="transparent" />
            <path
              d="M 6 0 L 0 0 0 6"
              fill="none"
              stroke="currentColor"
              className="text-stone-900/15 dark:text-stone-100/10"
              strokeWidth="0.5"
            />
            <circle
              cx="3"
              cy="3"
              r="0.55"
              fill="currentColor"
              className="text-stone-800/20 dark:text-stone-200/15"
            />
          </pattern>

          {/* 顶部宣纸底色渐变 */}
          <linearGradient id="bg-parchment-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f3efe8" className="dark:text-[#181716]" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#e9e3d7" className="dark:text-[#151413]" stopOpacity="0.95" />
          </linearGradient>

          {/* 深层松烟水墨渐变 (Deep Taupe/Charcoal Ink) */}
          <linearGradient id="ink-grad-1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9c9588" className="dark:text-[#32302c]" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8c8578" className="dark:text-[#252320]" stopOpacity="0.95" />
          </linearGradient>

          {/* 中层淡雅青灰渐变 (Muted Olive Grey Ink) */}
          <linearGradient id="ink-grad-2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#bab3a5" className="dark:text-[#2a2825]" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#aca597" className="dark:text-[#1f1e1b]" stopOpacity="1" />
          </linearGradient>

          {/* 前景温润宣纸米黄渐变 (Forefront Oatmeal Paper) */}
          <linearGradient id="ink-grad-3" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ebe6dc" className="dark:text-[#1b1a18]" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#dfd9cd" className="dark:text-[#141312]" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* 0. 顶部宣纸底色基底 */}
        <rect width="1440" height="90" fill="url(#bg-parchment-grad)" className="dark:fill-[#171615]" />

        {/* 1. 上层深色水墨波纹 (Layer 1: Deep Ink Wave) */}
        <path
          d="M 0 12 C 180 6, 320 24, 480 28 C 640 32, 760 10, 920 14 C 1080 18, 1220 36, 1440 26 L 1440 90 L 0 90 Z"
          fill="url(#ink-grad-1)"
          className="dark:fill-[#302e2a]"
        />

        {/* 2. 中层淡雅水墨缓和波浪 (Layer 2: Soft Middle Ink Wave) */}
        <path
          d="M 0 22 C 160 18, 280 38, 440 42 C 600 46, 720 18, 880 22 C 1040 26, 1200 46, 1440 38 L 1440 90 L 0 90 Z"
          fill="url(#ink-grad-2)"
          className="dark:fill-[#262421]"
        />

        {/* 3. 前景主波纹 (Layer 3: Large Organic Undulating Hill & Valley from Reference) */}
        {/* 左侧峰起(x~220, y~12) -> 中部深谷(x~580, y~52) -> 右侧舒缓峰(x~960, y~18) -> 右端斜入(x~1440, y~40) */}
        <path
          d="M 0 32 C 100 8, 200 12, 340 34 C 470 56, 560 62, 700 46 C 840 30, 940 14, 1080 16 C 1220 18, 1340 40, 1440 42 L 1440 90 L 0 90 Z"
          fill="url(#ink-grad-3)"
          className="dark:fill-[#1a1918]"
        />

        {/* 4. 细腻宣纸竹帘微格纹理叠加 (Layer 4: Delicate Paper Texture Mesh) */}
        <path
          d="M 0 32 C 100 8, 200 12, 340 34 C 470 56, 560 62, 700 46 C 840 30, 940 14, 1080 16 C 1220 18, 1340 40, 1440 42 L 1440 90 L 0 90 Z"
          fill="url(#ink-paper-mesh)"
          opacity="0.85"
        />

        {/* 5. 宣纸波纹立体勾边微线 (Layer 5: Refined Edge Stroke) */}
        <path
          d="M 0 32 C 100 8, 200 12, 340 34 C 470 56, 560 62, 700 46 C 840 30, 940 14, 1080 16 C 1220 18, 1340 40, 1440 42"
          stroke="currentColor"
          className="text-[#d0c9bc] dark:text-[#3d3a35]"
          strokeWidth="0.8"
          strokeOpacity="0.8"
          fill="none"
        />
      </svg>
    </div>
  );
};
