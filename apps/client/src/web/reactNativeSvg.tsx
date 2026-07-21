import React from 'react';

/**
 * Minimal web shim for `react-native-svg`.
 * Maps RN-SVG primitives onto native DOM SVG elements so the same JSX
 * renders on the web. Props like `stopColor`, `x1`, `gradientUnits`, etc.
 * are valid SVG DOM attributes and pass straight through.
 */

export default function Svg({ children, ...props }: React.SVGProps<SVGSVGElement>) {
  return <svg {...props}>{children}</svg>;
}

export function Circle(props: React.SVGProps<SVGCircleElement>) {
  return <circle {...props} />;
}

export function Path(props: React.SVGProps<SVGPathElement>) {
  return <path {...props} />;
}

export function Rect(props: React.SVGProps<SVGRectElement>) {
  return <rect {...props} />;
}

export function Line(props: React.SVGProps<SVGLineElement>) {
  return <line {...props} />;
}

export function Polyline(props: React.SVGProps<SVGPolylineElement>) {
  return <polyline {...props} />;
}

export function Polygon(props: React.SVGProps<SVGPolygonElement>) {
  return <polygon {...props} />;
}

export function Ellipse(props: React.SVGProps<SVGEllipseElement>) {
  return <ellipse {...props} />;
}

export function G(props: React.SVGProps<SVGGElement>) {
  return <g {...props} />;
}

export function Defs({ children, ...props }: React.SVGProps<SVGDefsElement>) {
  return <defs {...props}>{children}</defs>;
}

export function LinearGradient({ children, ...props }: React.SVGProps<SVGLinearGradientElement>) {
  return <linearGradient {...props}>{children}</linearGradient>;
}

export function RadialGradient({ children, ...props }: React.SVGProps<SVGRadialGradientElement>) {
  return <radialGradient {...props}>{children}</radialGradient>;
}

export function Stop(props: React.SVGProps<SVGStopElement>) {
  return <stop {...props} />;
}

export function ClipPath({ children, ...props }: React.SVGProps<SVGClipPathElement>) {
  return <clipPath {...props}>{children}</clipPath>;
}

export function SvgText({ children, ...props }: React.SVGProps<SVGTextElement>) {
  return <text {...props}>{children}</text>;
}

export { SvgText as Text };
