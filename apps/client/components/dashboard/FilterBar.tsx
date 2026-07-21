import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { dash } from './dashboardTheme';

type FilterBarItem = {
  key: string;
  label: string;
  value: string;
  active?: boolean;
  loading?: boolean;
  onPress: () => void;
};

export default function FilterBar({ items }: { items: FilterBarItem[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-w-full">
      <View
        className="flex-row gap-1 p-1 rounded-[15px] border"
        style={{ backgroundColor: dash.lineSoft, borderColor: dash.hairline }}
      >
        {items.map((item) => {
          const isActive = item.active;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="button"
              className="dash-filter-hover h-10 rounded-[11px] px-3.5 flex-row items-center active:scale-[0.98] transition-all duration-200"
              style={{
                backgroundColor: isActive ? dash.surface : 'transparent',
                ...(isActive ? dash.shadow.sm : {}),
              }}
            >
              <Text
                className="text-[9px] font-bold uppercase tracking-[0.08em] mr-2"
                style={{ color: isActive ? dash.accentBlue : dash.faint }}
              >
                {item.label}
              </Text>
              <Text
                className="text-[12px] font-semibold max-w-[170px]"
                style={{ color: isActive ? dash.ink : dash.inkSoft }}
                numberOfLines={1}
              >
                {item.loading ? 'Loading...' : item.value}
              </Text>
              <MaterialIcons
                name="expand-more"
                size={16}
                color={isActive ? dash.accentBlue : dash.faint}
                style={{ marginLeft: 3 }}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
