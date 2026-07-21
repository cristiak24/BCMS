import { useState } from 'react';
import { ScrollView, Text, View } from '@/src/web/reactNative';
import InviteUserForm from '../../components/super-admin/InviteUserForm';
import CreateClubModal from '../../components/super-admin/CreateClubModal';

export default function CreateUserScreen() {
  const [createClubOpen, setCreateClubOpen] = useState(false);

  return (
    <>
      <ScrollView
        className="flex-1 bg-[#EEF3FF]"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingVertical: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-[980px] self-start flex-1 justify-start gap-5">
          <View className="rounded-[32px] border border-[#E8EEFF] bg-white px-6 py-5 shadow-sm">
            <Text className="text-[#173AA8] text-[11px] font-black tracking-[0.3em] uppercase">
              User Management
            </Text>
            <Text className="text-[#102A72] text-[28px] font-black tracking-tight mt-2">
              Create user invitation
            </Text>
            <Text className="text-[#7483A6] text-[14px] mt-2 max-w-[760px] leading-6">
              Select an existing club, assign the role, and send a secure invite link. Club changes are reflected instantly in this form.
            </Text>
          </View>

          <InviteUserForm onCreateClub={() => setCreateClubOpen(true)} />
        </View>
      </ScrollView>

      <CreateClubModal visible={createClubOpen} onClose={() => setCreateClubOpen(false)} />
    </>
  );
}
