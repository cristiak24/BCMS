import { Pressable, Text, View } from '@/src/web/reactNative';
import AuraInput from '../ui/AuraInput';
import { PRESET_REFRESH_INTERVALS } from '../../utils/manageAccess';

type Props = {
    value: number;
    customMinutes: string;
    onChange: (minutes: number) => void;
    onChangeCustomMinutes: (value: string) => void;
};

export default function RefreshIntervalSelector({ value, customMinutes, onChange, onChangeCustomMinutes }: Props) {
    const isCustomSelected = !PRESET_REFRESH_INTERVALS.includes(value);

    return (
        <View>
            <View className="flex-row flex-wrap gap-2 mb-4">
                {PRESET_REFRESH_INTERVALS.map((minutes) => {
                    const isActive = value === minutes;

                    return (
                        <Pressable
                            key={minutes}
                            onPress={() => onChange(minutes)}
                            className={`rounded-full px-4 py-2 border ${isActive ? 'bg-[#1D4ED8] border-[#1D4ED8]' : 'bg-white border-slate-200'}`}
                        >
                            <Text className={`font-semibold ${isActive ? 'text-white' : 'text-slate-700'}`}>
                                {minutes === 60 ? '1 hour' : `${minutes} min`}
                            </Text>
                        </Pressable>
                    );
                })}
                <Pressable
                    onPress={() => {
                        const parsed = Number(customMinutes);
                        onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : value);
                    }}
                    className={`rounded-full px-4 py-2 border ${isCustomSelected ? 'bg-[#1D4ED8] border-[#1D4ED8]' : 'bg-white border-slate-200'}`}
                >
                    <Text className={`font-semibold ${isCustomSelected ? 'text-white' : 'text-slate-700'}`}>Custom</Text>
                </Pressable>
            </View>

            <AuraInput
                label="Custom Minutes"
                iconName="timer"
                keyboardType="number-pad"
                placeholder="Enter custom interval"
                value={customMinutes}
                onChangeText={onChangeCustomMinutes}
            />
        </View>
    );
}
