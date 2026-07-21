import { View, Text } from '@/src/web/reactNative';

type Props = {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: 'blue' | 'sky' | 'indigo' | 'red' | 'emerald';
};

const ACCENTS = {
  blue: 'from-[#1437A6] to-[#275BEB]',
  sky: 'from-[#0E7490] to-[#38BDF8]',
  indigo: 'from-[#3730A3] to-[#818CF8]',
  red: 'from-[#B91C1C] to-[#F87171]',
  emerald: 'from-[#047857] to-[#34D399]',
} as const;

export default function StatCard({ label, value, subtitle, accent = 'blue' }: Props) {
  return (
    <View className="flex-1 min-w-[180px] bg-white rounded-[28px] border border-[#E8EEFF] p-5 shadow-sm">
      <Text className="text-[#6B7AA6] uppercase tracking-[0.25em] text-[10px] font-black">{label}</Text>
      <View className={`mt-3 h-1.5 w-20 rounded-full bg-gradient-to-r ${ACCENTS[accent]}`} />
      <Text className="text-[#102A72] text-[30px] font-black mt-3 tracking-tight">{value}</Text>
      {subtitle ? <Text className="text-[#7483A6] text-[12px] mt-1">{subtitle}</Text> : null}
    </View>
  );
}
