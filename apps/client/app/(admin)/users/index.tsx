import { View, Text, FlatList, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { Link } from '@/src/web/expoRouter';
import { useEffect, useState } from 'react';
import { usersApi, User } from '../../../services/usersApi';
import { useResponsive } from '../../../hooks/useResponsive';

export default function UserList() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { isMobile } = useResponsive();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const data = await usersApi.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <ActivityIndicator size="large" className="mt-10" />;
    }

    return (
        <View className="flex-1">
            <View className="flex-row justify-between items-center mb-6">
                <Text className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900`}>User Management</Text>
            </View>

            <View className="bg-white rounded-lg shadow overflow-hidden">
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <Link href={`/admin/users/${item.id}`} asChild>
                            <Pressable className={`border-b border-gray-100 p-4 active:bg-gray-100 ${isMobile ? 'gap-2' : 'flex-row items-center hover:bg-gray-50 cursor-pointer'}`}>
                                <Text className={`${isMobile ? 'text-xs' : 'w-16'} text-gray-500`}>#{item.id}</Text>
                                <Text className={`${isMobile ? 'text-base' : 'flex-1'} text-gray-900 font-medium`}>{item.name}</Text>
                                <Text className={`${isMobile ? 'text-sm' : 'flex-1'} text-gray-600`}>{item.email}</Text>
                                <View className={isMobile ? '' : 'w-32'}>
                                    <Text className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full self-start font-medium capitalize">
                                        {item.role}
                                    </Text>
                                </View>
                            </Pressable>
                        </Link>
                    )}
                />
            </View>
        </View>
    );
}
