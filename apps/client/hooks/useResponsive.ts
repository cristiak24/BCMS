import { useWindowDimensions } from '@/src/web/reactNative';

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return {
    width,
    height,
    isSmallPhone: width < 390,
    isMobile: width < 1024,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}
