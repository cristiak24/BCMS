import React, { ReactElement, useMemo } from 'react';
import {
  Link as RouterLink,
  Navigate,
  Outlet,
  To,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

function normalizeHref(href: any): To {
  if (typeof href === 'string') {
    return href.replace('/(admin)', '').replace('/(tabs)', '');
  }

  if (href?.pathname) {
    return {
      ...href,
      pathname: String(href.pathname).replace('/(admin)', '').replace('/(tabs)', ''),
    };
  }

  return href || '/';
}

/**
 * Whether there is an in-app page to go back to. react-router keeps its own
 * entry index in history.state; the old `history.length > 1` was true for any
 * tab that had visited ANY page before (another site, the login redirect), so
 * "Înapoi" on a page opened directly — a shared link, a refresh, a
 * notification — left the app or did nothing at all.
 */
function canGoBackInApp() {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => {
      // Back with a fallback: with no in-app history, go to `fallback`
      // (default "/", which redirects to the role's home) instead of doing
      // nothing.
      const back = (fallback: any = '/') => {
        if (canGoBackInApp()) navigate(-1);
        else navigate(normalizeHref(fallback), { replace: true });
      };
      return {
        push: (href: any) => navigate(normalizeHref(href)),
        replace: (href: any) => navigate(normalizeHref(href), { replace: true }),
        back,
        canGoBack: canGoBackInApp,
        navigate: (href: any) => navigate(normalizeHref(href)),
        dismiss: () => back(),
      };
    },
    [navigate],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function useLocalSearchParams<T extends Record<string, any> = Record<string, string>>() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());
  return { ...query, ...params } as T;
}

export function Redirect({ href }: { href: any }) {
  return <Navigate to={normalizeHref(href)} replace />;
}

export function Slot() {
  return <Outlet />;
}

export function Link({
  href,
  asChild,
  children,
  onPress,
  ...props
}: {
  href: any;
  asChild?: boolean;
  children?: React.ReactNode;
  onPress?: () => void;
  [key: string]: any;
}) {
  const navigate = useNavigate();
  const to = normalizeHref(href);

  if (asChild && React.isValidElement(children)) {
    const child = children as ReactElement<any>;
    const navigateToHref = (event?: React.MouseEvent) => {
      if (event?.defaultPrevented) {
        return;
      }
      onPress?.();
      navigate(to);
    };

    return React.cloneElement(child, {
      ...child.props,
      onClick: (event: React.MouseEvent) => {
        child.props.onClick?.(event);
        navigateToHref(event);
      },
      href: typeof to === 'string' ? to : undefined,
    });
  }

  return (
    <RouterLink {...props} to={to} onClick={onPress}>
      {children}
    </RouterLink>
  );
}

function Navigator({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

Navigator.Screen = function Screen() {
  return null;
};

export const Stack = Navigator;
export const Tabs = Navigator;
