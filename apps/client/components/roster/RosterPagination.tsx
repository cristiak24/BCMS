import React from 'react';
import { Pressable, StyleSheet, Text, View } from '@/src/web/reactNative';
import { dash } from '../dashboard/dashboardTheme';

interface RosterPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function buildVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5];
  }

  if (currentPage >= totalPages - 2) {
    return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
}

export default function RosterPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: RosterPaginationProps) {
  if (totalItems === 0) {
    return null;
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const visiblePages = buildVisiblePages(currentPage, totalPages);

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        Sportivii {start}-{end} din {totalItems}
      </Text>

      <View style={styles.controls}>
        <Pressable
          onPress={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="dash-nav-btn"
          style={[styles.navButton, currentPage === 1 && styles.disabledButton]}
        >
          <Text style={[styles.navLabel, currentPage === 1 && styles.disabledLabel]}>Anterior</Text>
        </Pressable>

        <View style={styles.pageRow}>
          {visiblePages.map((page) => {
            const active = page === currentPage;

            return (
              <Pressable
                key={page}
                onPress={() => onPageChange(page)}
                className="dash-nav-btn"
                style={[styles.pageButton, active && styles.pageButtonActive]}
              >
                <Text style={[styles.pageLabel, active && styles.pageLabelActive]}>{page}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="dash-nav-btn"
          style={[styles.navButton, currentPage === totalPages && styles.disabledButton]}
        >
          <Text style={[styles.navLabel, currentPage === totalPages && styles.disabledLabel]}>Următor</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    gap: 12,
  },
  summary: {
    fontSize: 13,
    color: dash.muted,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  navButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(37,99,235,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: dash.lineSoft,
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: dash.accentBlue,
  },
  disabledLabel: {
    color: dash.faint,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pageButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: dash.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageButtonActive: {
    backgroundColor: dash.accentBlue,
  },
  pageLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: dash.inkSoft,
  },
  pageLabelActive: {
    color: '#FFFFFF',
  },
});
