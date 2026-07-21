import React, {
  CSSProperties,
  ImgHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useEffect,
  useMemo,
  useState,
} from 'react';

type AnyProps = Record<string, any>;
type StyleInput = CSSProperties | StyleInput[] | null | false | undefined;
type RNStyle = CSSProperties & {
  paddingHorizontal?: number | string;
  paddingVertical?: number | string;
  marginHorizontal?: number | string;
  marginVertical?: number | string;
  shadowColor?: string;
  shadowOffset?: { width?: number; height?: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
};

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  let h = match[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * React Native style objects use shorthand/native-only properties
 * (paddingHorizontal, shadowColor, elevation, ...) that have no meaning as
 * plain CSS and were previously passed straight through to the DOM `style`
 * attribute, where the browser silently ignores them. That made every
 * paddingHorizontal, paddingVertical, marginHorizontal, marginVertical and
 * shadow style in the app a no-op on web. This translates them into real
 * CSS so RN-authored styles actually render.
 */
function translateRNStyle(style: RNStyle): CSSProperties {
  const {
    paddingHorizontal, paddingVertical,
    marginHorizontal, marginVertical,
    shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation,
    ...rest
  } = style;

  const out: CSSProperties = { ...rest };

  if (paddingHorizontal !== undefined) {
    if (out.paddingLeft === undefined) out.paddingLeft = paddingHorizontal;
    if (out.paddingRight === undefined) out.paddingRight = paddingHorizontal;
  }
  if (paddingVertical !== undefined) {
    if (out.paddingTop === undefined) out.paddingTop = paddingVertical;
    if (out.paddingBottom === undefined) out.paddingBottom = paddingVertical;
  }
  if (marginHorizontal !== undefined) {
    if (out.marginLeft === undefined) out.marginLeft = marginHorizontal;
    if (out.marginRight === undefined) out.marginRight = marginHorizontal;
  }
  if (marginVertical !== undefined) {
    if (out.marginTop === undefined) out.marginTop = marginVertical;
    if (out.marginBottom === undefined) out.marginBottom = marginVertical;
  }

  if (!out.boxShadow) {
    if (shadowColor) {
      const offsetX = shadowOffset?.width ?? 0;
      const offsetY = shadowOffset?.height ?? 0;
      const opacity = shadowOpacity ?? 1;
      const blur = shadowRadius ?? 0;
      out.boxShadow = `${offsetX}px ${offsetY}px ${blur}px ${hexToRgba(shadowColor, opacity)}`;
    } else if (elevation) {
      out.boxShadow = `0px ${Math.round(elevation / 2)}px ${elevation}px rgba(0, 0, 0, 0.2)`;
    }
  }

  // React Native's `lineHeight: 46` means "46 logical pixels" — an absolute
  // value, same units as fontSize. But CSS treats a bare numeric
  // line-height as a *unitless multiplier* of font-size, and React's DOM
  // style handling deliberately leaves lineHeight numbers unitless (it's on
  // React's own no-px whitelist). So `lineHeight: 46` at fontSize 38 was
  // silently computing to 46 * 38 = 1748px instead of 46px, blowing up the
  // line box for every Text that sets a numeric lineHeight.
  if (typeof out.lineHeight === 'number') {
    out.lineHeight = `${out.lineHeight}px` as unknown as CSSProperties['lineHeight'];
  }

  return out;
}

function flattenStyle(style: StyleInput): CSSProperties | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle).filter(Boolean));
  }
  return translateRNStyle(style as RNStyle);
}

function withPointerEvents(style: CSSProperties | undefined, pointerEvents: AnyProps['pointerEvents']) {
  if (!pointerEvents || pointerEvents === 'auto') return style;
  const cssValue = pointerEvents === 'box-none' || pointerEvents === 'box-only' ? 'none' : pointerEvents;
  return { ...style, pointerEvents: cssValue as CSSProperties['pointerEvents'] };
}

function omitNativeProps(props: AnyProps) {
  const {
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    activeOpacity,
    autoComplete,
    autoCapitalize,
    autoCorrect,
    blurOnSubmit,
    contentContainerStyle,
    contentContainerClassName,
    dataDetectorType,
    editable,
    enablesReturnKeyAutomatically,
    hitSlop,
    keyboardShouldPersistTaps,
    numberOfLines,
    onSubmitEditing,
    onPress,
    onLongPress,
    pointerEvents,
    returnKeyType,
    showsHorizontalScrollIndicator,
    showsVerticalScrollIndicator,
    spellCheck,
    testID,
    textContentType,
    underlayColor,
    ...rest
  } = props;

  return {
    rest,
    native: {
      accessibilityLabel,
      accessibilityRole,
      contentContainerClassName,
      contentContainerStyle,
      numberOfLines,
      onPress,
      pointerEvents,
      testID,
    },
  };
}

function cx(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ') || undefined;
}

function createBox(tag: keyof JSX.IntrinsicElements, defaultClassName?: string) {
  return React.forwardRef<HTMLElement, AnyProps>(function Box(props, ref) {
    const { rest, native } = omitNativeProps(props);
    const {
      children,
      className,
      disabled,
      href,
      onClick,
      role,
      style,
      ...domProps
    } = rest;

    const Element = tag as any;
    return (
      <Element
        {...domProps}
        aria-disabled={disabled || undefined}
        aria-label={native.accessibilityLabel}
        data-testid={native.testID}
        ref={ref}
        role={role || native.accessibilityRole}
        style={withPointerEvents(flattenStyle(style), native.pointerEvents)}
        className={cx(defaultClassName, className)}
        onClick={
          disabled
            ? undefined
            : (event: React.MouseEvent<HTMLElement>) => {
                onClick?.(event);
                if (!event.defaultPrevented) {
                  native.onPress?.(event);
                }
              }
        }
        href={href}
      >
        {children}
      </Element>
    );
  });
}

export const View = createBox('div', 'rn-view');
export const KeyboardAvoidingView = View;
export const SafeAreaView = View;

export const Text = React.forwardRef<HTMLElement, AnyProps>(function Text(props, ref) {
  const { rest, native } = omitNativeProps(props);
  const { children, className, style, ...domProps } = rest;
  const flattened = flattenStyle(style);
  const lineClamp =
    typeof native.numberOfLines === 'number'
      ? ({
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: native.numberOfLines,
          display: '-webkit-box',
          overflow: 'hidden',
        } as CSSProperties)
      : undefined;

  return (
    <span
      {...domProps}
      aria-label={native.accessibilityLabel}
      data-testid={native.testID}
      ref={ref}
      style={{ ...flattened, ...lineClamp }}
      className={cx('rn-text', className)}
    >
      {children}
    </span>
  );
});

export const Pressable = React.forwardRef<HTMLElement, AnyProps>(function Pressable(props, ref) {
  const { rest, native } = omitNativeProps(props);
  const { children, className, disabled, onClick, style, type, ...domProps } = rest;
  return (
    <button
      {...domProps}
      aria-disabled={disabled || undefined}
      data-testid={native.testID}
      disabled={disabled}
      ref={ref as any}
      type={type || 'button'}
      onClick={
        disabled
          ? undefined
          : (event) => {
              onClick?.(event);
              if (!event.defaultPrevented) {
                native.onPress?.(event);
              }
            }
      }
      style={flattenStyle(style)}
      className={cx('rn-pressable', className)}
    >
      {typeof children === 'function' ? children({ pressed: false, hovered: false, focused: false }) : children}
    </button>
  );
});

export const TouchableOpacity = Pressable;
export const TouchableHighlight = Pressable;

export type ScrollViewHandle = {
  scrollTo: (options: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToEnd: (options?: { animated?: boolean }) => void;
};

export const ScrollView = React.forwardRef<ScrollViewHandle, AnyProps>(function ScrollView(props, ref) {
  const { rest, native } = omitNativeProps(props);
  const { children, className, horizontal, style, onScroll, scrollEventThrottle, ...domProps } = rest;
  const innerRef = React.useRef<HTMLDivElement>(null);

  React.useImperativeHandle(ref, () => ({
    scrollTo: ({ x, y, animated = true }) => {
      innerRef.current?.scrollTo({
        left: x,
        top: y,
        behavior: animated ? 'smooth' : 'auto',
      });
    },
    scrollToEnd: ({ animated = true } = {}) => {
      const node = innerRef.current;
      if (!node) return;
      node.scrollTo({
        left: horizontal ? node.scrollWidth : undefined,
        top: horizontal ? undefined : node.scrollHeight,
        behavior: animated ? 'smooth' : 'auto',
      });
    },
  }), [horizontal]);

  return (
    <div
      {...domProps}
      ref={innerRef}
      className={cx('rn-scroll-view', horizontal && 'rn-scroll-horizontal', className)}
      style={flattenStyle(style)}
      onScroll={
        onScroll
          ? (event: React.UIEvent<HTMLDivElement>) => {
              const target = event.currentTarget;
              onScroll({
                ...event,
                nativeEvent: {
                  ...event.nativeEvent,
                  contentOffset: { x: target.scrollLeft, y: target.scrollTop },
                },
              });
            }
          : undefined
      }
    >
      <div
        className={cx('rn-scroll-content', native.contentContainerClassName)}
        style={flattenStyle(native.contentContainerStyle)}
      >
        {children}
      </div>
    </div>
  );
});

export function FlatList<T>({
  data = [],
  renderItem,
  keyExtractor,
  ListEmptyComponent,
  ItemSeparatorComponent,
  className,
  contentContainerStyle,
  style,
  ...props
}: AnyProps & {
  data?: T[];
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
}) {
  const items = data || [];
  if (!items.length && ListEmptyComponent) {
    return (
      <ScrollView className={className} contentContainerStyle={contentContainerStyle} style={style} {...props}>
        {typeof ListEmptyComponent === 'function' ? <ListEmptyComponent /> : ListEmptyComponent}
      </ScrollView>
    );
  }

  return (
    <ScrollView className={className} contentContainerStyle={contentContainerStyle} style={style} {...props}>
      {items.map((item, index) => (
        <React.Fragment key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem({ item, index })}
          {ItemSeparatorComponent && index < items.length - 1
            ? typeof ItemSeparatorComponent === 'function'
              ? <ItemSeparatorComponent />
              : ItemSeparatorComponent
            : null}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

export function TextInput({
  multiline,
  onChangeText,
  value,
  defaultValue,
  placeholderTextColor,
  secureTextEntry,
  keyboardType,
  editable = true,
  accessibilityLabel,
  autoCapitalize,
  blurOnSubmit,
  onSubmitEditing,
  returnKeyType,
  textContentType,
  className,
  style,
  ...props
}: AnyProps & (InputHTMLAttributes<HTMLInputElement> | TextareaHTMLAttributes<HTMLTextAreaElement>)) {
  const common = {
    ...props,
    className: cx('rn-text-input', className),
    'aria-label': accessibilityLabel,
    disabled: !editable,
    autoComplete: props.autoComplete,
    autoCapitalize,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeText?.(event.target.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      props.onKeyDown?.(event as any);
      if (event.key === 'Enter' && !multiline) {
        onSubmitEditing?.();
      }
    },
    placeholder: props.placeholder,
    style: { ...flattenStyle(style), '--placeholder-color': placeholderTextColor } as CSSProperties,
    value: value ?? defaultValue ?? '',
  };

  if (multiline) {
    return <textarea {...(common as TextareaHTMLAttributes<HTMLTextAreaElement>)} />;
  }

  return (
    <input
      {...(common as InputHTMLAttributes<HTMLInputElement>)}
      type={secureTextEntry ? 'password' : keyboardType === 'email-address' ? 'email' : keyboardType === 'numeric' ? 'number' : 'text'}
    />
  );
}

export function Image({
  source,
  src,
  alt,
  className,
  style,
  resizeMode,
  ...props
}: AnyProps & ImgHTMLAttributes<HTMLImageElement>) {
  const resolvedSrc = src || (typeof source === 'string' ? source : source?.uri);
  return (
    <img
      {...props}
      alt={alt || ''}
      className={cx('rn-image', className)}
      src={resolvedSrc}
      style={{ objectFit: resizeMode === 'contain' ? 'contain' : 'cover', ...flattenStyle(style) }}
    />
  );
}

export function ActivityIndicator({ size = 'small', color = '#2563EB', className, style }: AnyProps) {
  const px = size === 'large' ? 28 : typeof size === 'number' ? size : 18;
  return (
    <span
      className={cx('rn-activity-indicator', className)}
      style={{ width: px, height: px, borderColor: color, ...flattenStyle(style) }}
    />
  );
}

export function Modal({ visible, children }: { visible?: boolean; children?: ReactNode }) {
  if (!visible) return null;
  return <div className="rn-modal">{children}</div>;
}

export function Switch({ value, onValueChange, disabled, className }: AnyProps) {
  return (
    <input
      className={cx('rn-switch', className)}
      type="checkbox"
      checked={!!value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.checked)}
    />
  );
}

export const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(styles: T): T {
    return styles;
  },
  flatten: flattenStyle,
  absoluteFillObject: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  } as CSSProperties,
  hairlineWidth: 1,
};

export const Platform = {
  OS: 'web',
  select<T>(options: Record<string, T>): T | undefined {
    return options.web ?? options.default;
  },
};

export const Alert = {
  alert(title: string, message?: string, buttons?: Array<{ text?: string; onPress?: () => void; style?: string }>) {
    const text = [title, message].filter(Boolean).join('\n\n');
    const cancel = buttons?.find((button) => button.style === 'cancel');
    const destructive = buttons?.find((button) => button.style === 'destructive');
    const primary = buttons?.find((button) => button.style !== 'cancel' && button.style !== 'destructive') ?? destructive;

    if (buttons && buttons.length > 1) {
      const confirmed = window.confirm(text);
      (confirmed ? primary : cancel)?.onPress?.();
      return;
    }

    window.alert(text);
    primary?.onPress?.();
  },
};

export const Share = {
  async share({ message, url }: { message?: string; url?: string }) {
    if (navigator.share) {
      await navigator.share({ text: message, url });
      return { action: 'sharedAction' };
    }
    await navigator.clipboard?.writeText(url || message || '');
    return { action: 'sharedAction' };
  },
};

export function useWindowDimensions() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scale: window.devicePixelRatio || 1,
    fontScale: 1,
  }));

  useEffect(() => {
    const onResize = () =>
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
        scale: window.devicePixelRatio || 1,
        fontScale: 1,
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}

class AnimatedValue {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
  setValue(value: number) {
    this.value = value;
  }
  interpolate() {
    return this.value;
  }
}

export const Animated = {
  Value: AnimatedValue,
  View,
  timing(value: AnimatedValue, config: { toValue: number }) {
    return {
      start(callback?: (state: { finished: boolean }) => void) {
        value.setValue(config.toValue);
        callback?.({ finished: true });
      },
    };
  },
};

export const Easing = {
  cubic: (value: number) => value,
  in: (fn: (value: number) => number) => fn,
  out: (fn: (value: number) => number) => fn,
};

export type ViewStyle = CSSProperties;
export type TextStyle = CSSProperties;
export type ImageStyle = CSSProperties;
export type StyleProp<T> = T | T[] | null | undefined | false;
export type TextInputProps = AnyProps;
export type PressableProps = AnyProps;
export type ViewProps = AnyProps;
