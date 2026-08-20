"use client";

import "./animated-sovereign-background.css";

export function AnimatedSovereignBackground() {
  return (
    <div className="sovereign-bg" aria-hidden="true">
      <div className="sovereign-bg__base" />
      <div className="sovereign-bg__aura" />

      <svg className="sovereign-bg__ribbons" viewBox="0 0 1600 900" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sovereign-blue-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0369a1" stopOpacity="0" />
            <stop offset=".22" stopColor="#d3a23e" stopOpacity=".42" />
            <stop offset=".5" stopColor="#e4bb5e" stopOpacity="1" />
            <stop offset=".72" stopColor="#b1842c" stopOpacity=".68" />
            <stop offset="1" stopColor="#86631f" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sovereign-blue-soft" x1="0" y1="0" x2="1" y2=".35">
            <stop offset="0" stopColor="#b1842c" stopOpacity="0" />
            <stop offset=".32" stopColor="#b1842c" stopOpacity=".26" />
            <stop offset=".58" stopColor="#e4bb5e" stopOpacity=".72" />
            <stop offset="1" stopColor="#86631f" stopOpacity="0" />
          </linearGradient>
          <filter id="sovereign-line-glow" x="-30%" y="-120%" width="160%" height="340%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="sovereign-soft-glow" x="-30%" y="-100%" width="160%" height="300%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        <g className="sovereign-bg__flow sovereign-bg__flow--top">
          <path className="sovereign-bg__blur-line" d="M-140 224 C126 214 274 144 430 76 C634 -12 808 42 982 92 C1194 153 1408 194 1740 234" />
          <path className="sovereign-bg__soft-line" d="M-126 210 C142 201 286 136 438 70 C638 -16 810 36 986 84 C1198 142 1412 184 1734 222" />
          <path className="sovereign-bg__core-line" d="M-112 194 C158 186 302 126 452 62 C646 -20 818 29 994 76 C1204 132 1418 174 1726 210" />
          <path className="sovereign-bg__hair-line" d="M-96 180 C176 172 316 116 466 54 C654 -24 824 22 1002 68 C1212 122 1422 162 1718 198" />
        </g>

        <g className="sovereign-bg__flow sovereign-bg__flow--bottom">
          <path className="sovereign-bg__blur-line" d="M-180 940 C156 868 348 1000 646 978 C932 956 1118 896 1298 832 C1484 766 1592 654 1770 486" />
          <path className="sovereign-bg__soft-line" d="M-156 926 C170 858 356 986 652 964 C934 942 1118 884 1294 822 C1476 758 1586 648 1754 500" />
          <path className="sovereign-bg__core-line" d="M-132 912 C184 848 366 972 660 950 C940 928 1118 872 1290 812 C1468 750 1578 644 1738 514" />
          <path className="sovereign-bg__hair-line" d="M-108 898 C198 838 376 958 668 936 C946 914 1118 860 1286 802 C1460 742 1570 640 1722 528" />
        </g>

        <g className="sovereign-bg__flow sovereign-bg__flow--lower">
          <path className="sovereign-bg__soft-line" d="M-170 986 C156 906 374 1000 680 974 C970 950 1174 866 1374 792 C1510 742 1616 674 1778 566" />
          <path className="sovereign-bg__core-line" d="M-136 970 C172 896 386 986 688 960 C976 936 1178 854 1370 782 C1506 732 1608 670 1758 580" />
        </g>
      </svg>

      <div className="sovereign-bg__readability" />
    </div>
  );
}
