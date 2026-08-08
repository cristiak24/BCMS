import { ReactNode } from 'react';
import { flattenStyle } from './reactNative';

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
  // Callers pass RN styles, which may be an array (e.g. [base, mobile]) or use
  // native-only props (shadowColor, elevation). flattenStyle normalizes both;
  // spreading a raw array here would produce `{0: ..., 1: ...}` and make React
  // throw "Failed to set an indexed property [0] on 'CSSStyleDeclaration'".
  style?: any;
  [key: string]: any;
}) {
  const background =
    colors.length >= 2
      ? `linear-gradient(135deg, ${colors.join(', ')})`
      : colors[0];

  return (
    <div {...props} className={`rn-view ${className ?? ''}`} style={{ ...flattenStyle(style), background }}>
      {children}
    </div>
  );
}
