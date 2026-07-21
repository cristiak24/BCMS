import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Pressable, Text, View } from '@/src/web/reactNative';
import type { InviteRole } from '../../types/manageAccess';

const ROLE_OPTIONS: { role: InviteRole; label: string; icon: keyof typeof MaterialIcons.glyphMap; }[] = [
    { role: 'player', label: 'Player', icon: 'sports-basketball' },
    { role: 'parent', label: 'Parent', icon: 'family-restroom' },
    { role: 'coach', label: 'Coach', icon: 'sports' },
];

type Props = {
    selectedRole: InviteRole;
    onSelectRole: (role: InviteRole) => void;
};

export default function RoleSelector({ selectedRole, onSelectRole }: Props) {
    return (
        <View className="gap-3">
            {ROLE_OPTIONS.map((option) => {
                const isActive = option.role === selectedRole;

                return (
                    <Pressable
                        key={option.role}
                        onPress={() => onSelectRole(option.role)}
                        className={`rounded-2xl border px-4 py-4 flex-row items-center justify-between ${isActive ? 'border-[#1D4ED8] bg-[#EFF6FF]' : 'border-slate-200 bg-white'}`}
                    >
                        <View className="flex-row items-center">
                            <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isActive ? 'bg-[#1D4ED8]' : 'bg-slate-100'}`}>
                                <MaterialIcons name={option.icon} size={20} color={isActive ? '#FFFFFF' : '#64748B'} />
                            </View>
                            <Text className={`font-bold capitalize ${isActive ? 'text-[#1D4ED8]' : 'text-slate-700'}`}>{option.label}</Text>
                        </View>
                        {isActive ? <MaterialIcons name="check-circle" size={22} color="#1D4ED8" /> : null}
                    </Pressable>
                );
            })}
        </View>
    );
}
