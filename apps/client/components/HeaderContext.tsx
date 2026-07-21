/**
 * HeaderContext
 *
 * Provides a lightweight bridge so individual pages can push dynamic content
 * into the global admin layout header without prop-drilling.
 *
 * Usage in any page:
 *
 *   const { setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();
 *
 *   useEffect(() => {
 *     setSearchPlaceholder('Search events...');
 *     setHeaderActions(<MyPageActions />);
 *     setMobileFab(<MyFAB />);
 *     return () => {
 *       setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
 *       setHeaderActions(null);
 *       setMobileFab(null);
 *     };
 *   }, [...deps]);
 */

import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';

export const DEFAULT_SEARCH_PLACEHOLDER = 'Search athletes, games, or reports...';

interface HeaderContextValue {
  /** Placeholder shown in the global search bar */
  searchPlaceholder: string;
  setSearchPlaceholder: (v: string) => void;
  searchValue: string;
  setSearchValue: (v: string) => void;

  /**
   * ReactNode rendered in the center zone of the desktop header.
   * Set to null when the page is unmounted.
   */
  headerActions: ReactNode;
  setHeaderActions: (node: ReactNode) => void;

  /**
   * ReactNode rendered absolutely above the mobile bottom nav
   * (typically a FAB button). Set to null on unmount.
   */
  mobileFab: ReactNode;
  setMobileFab: (node: ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  searchPlaceholder: DEFAULT_SEARCH_PLACEHOLDER,
  setSearchPlaceholder: () => {},
  searchValue: '',
  setSearchValue: () => {},
  headerActions: null,
  setHeaderActions: () => {},
  mobileFab: null,
  setMobileFab: () => {},
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [searchPlaceholder, setSearchPlaceholder] = useState(DEFAULT_SEARCH_PLACEHOLDER);
  const [searchValue, setSearchValue] = useState('');
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const [mobileFab, setMobileFab] = useState<ReactNode>(null);
  const value = useMemo(
    () => ({
      searchPlaceholder,
      setSearchPlaceholder,
      searchValue,
      setSearchValue,
      headerActions,
      setHeaderActions,
      mobileFab,
      setMobileFab,
    }),
    [headerActions, mobileFab, searchPlaceholder, searchValue],
  );

  return (
    <HeaderContext.Provider value={value}>
      {children}
    </HeaderContext.Provider>
  );
}

export const useHeader = () => useContext(HeaderContext);
