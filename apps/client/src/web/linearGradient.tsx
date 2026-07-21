import { ReactNode } from 'react';

export function LinearGradient({
  children,
  colors = [],
  start,
  end,
  className,
  style,
  ...props
}: {
  children?: ReactNode;
  colors?: string[];
  start?: unknown;
  end?: unknown;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}) {
  const background =
    colors.length >= 2
      ? `linear-gradient(135deg, ${colors.join(', ')})`
      : colors[0];

  return (
    <div {...props} className={`rn-view ${className ?? ''}`} style={{ ...style, background }}>
      {children}
    </div>
  );
}
