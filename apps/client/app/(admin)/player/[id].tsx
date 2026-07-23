import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Pressable, useWindowDimensions } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { ArrowLeft, Save, User, Mail, Hash, Calendar, Shield, CreditCard, Activity, CheckCircle, X, Info, ChevronRight, Award } from 'lucide-react';
import { LinearGradient } from '@/src/web/linearGradient';
import { teamsApi, Player } from '../../../services/teamsApi';

export default function PlayerProfile() {
  const { id, returnTo } = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < 900;
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [number, setNumber] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [status, setStatus] = useState('active');
  const [medicalExpiry, setMedicalExpiry] = useState('');

  const fetchPlayer = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await teamsApi.getPlayerById(parseInt(id as string));
      setPlayer(data);
      setFirstName(data.firstName || '');
      setLastName(data.lastName || '');
      setEmail(data.email || '');
      setNumber(data.number?.toString() || '');
      setBirthYear(data.birthYear?.toString() || '');
      setStatus(data.status || 'active');
      setMedicalExpiry(data.medicalCheckExpiry ? new Date(data.medicalCheckExpiry).toISOString().split('T')[0] : '');
    } catch (error) {
      console.error('Fetch player error:', error);
      Alert.alert('Error', 'Could not load player data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
      router.replace(returnTo as any);
      return;
    }

    router.replace('/admin/roster' as any);
  }, [returnTo, router]);

  const handleSave = async () => {
    if (!player) return;
    setSaving(true);
    try {
      await teamsApi.updatePlayer(player.id, {
        firstName,
        lastName,
        email,
        number: parseInt(number),
        birthYear: parseInt(birthYear),
        status,
        medicalCheckExpiry: medicalExpiry ? new Date(medicalExpiry).toISOString() : null
      });
      Alert.alert('Success', 'Profile saved successfully');
      handleGoBack();
    } catch (error) {
      console.error('Save player error:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  // Dynamic data mapping & fallbacks
  const initials = `${firstName?.[0] || 'P'}${lastName?.[0] || ''}`.toUpperCase();
  const displayCategory = player?.category || player?.teamNames?.[0] || player?.teamName || 'Unassigned';
  const displayStatus = player?.status || 'active';
  const displayPositionSq = `${player?.position || 'Player'} • ${player?.teamNames?.join(', ') || player?.teamName || 'No Team'}`;

  // Extension fields (would come from extended API)
  const attendanceRate = player?.attendanceRate ?? 0;
  const attendanceTrend = (player as any)?.attendanceTrend ?? 'No trend data';

  const campsRate = (player as any)?.campsRate ?? 0;
  const campsText = (player as any)?.campsText ?? 'No participation data';

  const matchesRate = (player as any)?.matchesRate ?? 0;
  const matchesLabel = (player as any)?.matchesLabel ?? 'N/A';
  const matchesDesc = (player as any)?.matchesDesc ?? 'No match data available.';

  const isMedicalValid = !!medicalExpiry && new Date(medicalExpiry) > new Date();
  
  const paymentStatusDisplay = ['paid', 'processed', 'succeeded', 'success'].includes(player?.paymentStatus?.toLowerCase() ?? '') ? 'Paid' : 'Pending';
  const feesName = (player as any)?.feesName ?? 'Season Fees';
  const paymentCurrency = player?.paymentCurrency || 'ron';
  const paymentTransactions = player?.paymentTransactions ?? [];
  const amountDue = player?.outstandingAmount ?? player?.amountDue ?? 0;
  const paidAmount = player?.paidAmount ?? paymentTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const displayedPaymentAmount = amountDue > 0 ? amountDue : paidAmount;
  const formatMoney = (amount: number, currency = paymentCurrency) =>
    new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency.toUpperCase() }).format(amount);

  const profileFields = [firstName, lastName, email, birthYear, number, medicalExpiry];
  const profileCompletion = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);
  const medicalStatusLabel = isMedicalValid ? 'Valid' : 'Needs date';
  const paymentTone = paymentStatusDisplay === 'Paid' ? 'blue' : 'orange';

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{children}</Text>
  );

  const MetricCard = ({
    label,
    value,
    caption,
    icon,
    color,
    progress,
  }: {
    label: string;
    value: string;
    caption: string;
    icon: React.ReactNode;
    color: string;
    progress: number;
  }) => (
    <View className="flex-1 min-w-[210px] rounded-[24px] border border-[#E5ECF6] bg-white p-5 shadow-sm">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</Text>
          <Text className="mt-2 text-3xl font-black text-[#0E2041]">{value}</Text>
          <Text className="mt-1 text-[11px] font-bold text-slate-400" numberOfLines={1}>{caption}</Text>
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}14` }}>
          {icon}
        </View>
      </View>
      <View className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <View className="h-full rounded-full" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: color }} />
      </View>
    </View>
  );

  const AdminStatusPill = ({ label, tone }: { label: string; tone: 'red' | 'blue' | 'orange' | 'emerald' }) => {
    const stylesByTone = {
      red: { backgroundColor: 'var(--c-danger-bg)', color: 'var(--c-danger)' },
      blue: { backgroundColor: 'var(--c-surface-tint)', color: 'var(--c-blue)' },
      orange: { backgroundColor: 'var(--c-warning-bg)', color: '#EA580C' },
      emerald: { backgroundColor: 'var(--c-success-bg)', color: 'var(--c-success-fg)' },
    };

    return (
      <View className="self-start rounded-full px-3 py-1" style={{ backgroundColor: stylesByTone[tone].backgroundColor }}>
        <Text className="text-[9px] font-black uppercase tracking-widest leading-none" style={{ color: stylesByTone[tone].color }}>{label}</Text>
      </View>
    );
  };


  return (
    <ScrollView className="flex-1 bg-[#F1F5F9]" showsVerticalScrollIndicator={false} contentContainerClassName="pb-16">
      <View className="pt-6 md:pt-8" style={{ paddingHorizontal: isCompact ? 16 : 32 }}>
        <View className="mb-5 flex-row items-center justify-between gap-3">
          <TouchableOpacity onPress={handleGoBack} className="h-11 w-11 items-center justify-center rounded-2xl border border-[#DDE7F3] bg-white shadow-sm">
            <ArrowLeft color="var(--c-ink)" size={19} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="h-11 flex-row items-center justify-center rounded-2xl bg-[#123B95] px-5 shadow-md shadow-blue-900/20 disabled:opacity-60"
          >
            {saving ? <ActivityIndicator size="small" color="white" /> : <Save color="white" size={17} />}
            <Text className="ml-2 text-[11px] font-black uppercase tracking-widest text-white">Save Profile</Text>
          </TouchableOpacity>
        </View>

        <View className="overflow-hidden rounded-[34px] border border-[#DCE7F5] bg-white shadow-sm">
          <LinearGradient
            colors={['#0E2F7F', 'var(--c-brand-fg)', '#2F6FE4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: isCompact ? 20 : 28 }}
          >
            <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: 20, alignItems: isCompact ? 'flex-start' : 'center' }}>
              <View className="relative">
                <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border-2 border-white/30 bg-white/15">
                  <Text className="text-3xl font-black text-white">{initials}</Text>
                </View>
                {displayStatus.toLowerCase() === 'active' && (
                  <View className="absolute -bottom-2 -right-2 h-8 w-8 items-center justify-center rounded-full border-4 border-[#1D3E90] bg-emerald-400">
                    <CheckCircle color="#FFFFFF" size={15} />
                  </View>
                )}
              </View>

              <View className="flex-1">
                <View className="mb-3 flex-row flex-wrap gap-2">
                  <View className="rounded-full bg-white/15 px-3 py-1.5">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-blue-50" numberOfLines={1}>{displayCategory}</Text>
                  </View>
                  <View className="flex-row items-center rounded-full bg-white px-3 py-1.5">
                    <View className={`mr-2 h-1.5 w-1.5 rounded-full ${displayStatus.toLowerCase() === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <Text className="text-[10px] font-black uppercase tracking-widest text-[#123B95]">{displayStatus}</Text>
                  </View>
                </View>
                <Text className="text-4xl font-black leading-tight text-white md:text-5xl" numberOfLines={2}>{firstName || 'Unknown'} {lastName || 'Player'}</Text>
                <Text className="mt-2 text-sm font-bold text-blue-100" numberOfLines={2}>{displayPositionSq}</Text>
              </View>

              <View className="w-full rounded-[24px] border border-white/15 bg-white/10 p-4 md:w-[300px]">
                <Text className="text-[10px] font-black uppercase tracking-widest text-blue-100">Profile readiness</Text>
                <View className="mt-3 flex-row items-end justify-between">
                  <Text className="text-4xl font-black text-white">{profileCompletion}%</Text>
                  <Text className="pb-1 text-[11px] font-bold text-blue-100">{profileFields.filter(Boolean).length}/{profileFields.length} fields</Text>
                </View>
                <View className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                  <View className="h-full rounded-full bg-white" style={{ width: `${profileCompletion}%` }} />
                </View>
              </View>
            </View>
          </LinearGradient>

          <View className="flex-row flex-wrap border-t border-[#E8EEF7] bg-white">
            <View className="min-w-[170px] flex-1 border-r border-[#EEF3F8] px-5 py-4">
              <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</Text>
              <Text className="mt-1 text-sm font-black text-[#0E2041]" numberOfLines={1}>{email || 'No email'}</Text>
            </View>
            <View className="min-w-[140px] flex-1 border-r border-[#EEF3F8] px-5 py-4">
              <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jersey</Text>
              <Text className="mt-1 text-sm font-black text-[#0E2041]">#{number || '--'}</Text>
            </View>
            <View className="min-w-[150px] flex-1 border-r border-[#EEF3F8] px-5 py-4">
              <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medical</Text>
              <Text className={`mt-1 text-sm font-black ${isMedicalValid ? 'text-emerald-600' : 'text-red-500'}`}>{medicalStatusLabel}</Text>
            </View>
            <View className="min-w-[150px] flex-1 px-5 py-4">
              <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment</Text>
              <Text className={`mt-1 text-sm font-black ${paymentStatusDisplay === 'Paid' ? 'text-blue-600' : 'text-orange-600'}`}>{paymentStatusDisplay}</Text>
            </View>
          </View>
        </View>

        <View className="mt-6 flex-row flex-wrap gap-4">
          <MetricCard
            label="Training"
            value={`${attendanceRate}%`}
            caption={attendanceTrend}
            icon={<Activity color="var(--c-blue)" size={19} />}
            color="var(--c-blue)"
            progress={attendanceRate}
          />
          <MetricCard
            label="Specialty camps"
            value={`${campsRate}%`}
            caption={campsText}
            icon={<Award color="var(--c-warning)" size={19} />}
            color="var(--c-warning)"
            progress={campsRate}
          />
          <TouchableOpacity onPress={() => setShowCalendar(true)} className="min-w-[240px] flex-1 rounded-[24px] bg-[#0E2041] p-5 shadow-md shadow-slate-900/20">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Text className="text-[10px] font-black uppercase tracking-widest text-blue-200">Match presence</Text>
                <View className="mt-2 flex-row items-center gap-3">
                  <Text className="text-3xl font-black text-white">{matchesRate}%</Text>
                  {matchesLabel !== 'N/A' && (
                    <View className="rounded-full bg-yellow-300 px-2 py-1">
                      <Text className="text-[8px] font-black uppercase tracking-widest text-[#0E2041]">{matchesLabel}</Text>
                    </View>
                  )}
                </View>
                <Text className="mt-1 text-[11px] font-bold text-blue-100" numberOfLines={1}>{matchesDesc}</Text>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                <ChevronRight color="#FFFFFF" size={18} />
              </View>
            </View>
            <View className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <View className="h-full rounded-full bg-blue-300" style={{ width: `${Math.min(Math.max(matchesRate, 0), 100)}%` }} />
            </View>
          </TouchableOpacity>
        </View>

        <View className="mt-6" style={{ flexDirection: isCompact ? 'column' : 'row', gap: 20, alignItems: 'flex-start' }}>
          <View className="w-full flex-1 rounded-[30px] border border-[#E1EAF5] bg-white p-5 shadow-sm md:p-7" style={{ minWidth: isCompact ? undefined : 0 }}>
            <View className="mb-6 flex-row items-center justify-between gap-4">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-[#EEF4FF]">
                  <User color="var(--c-brand-fg)" size={18} />
                </View>
                <View>
                  <Text className="text-xl font-black text-[#0E2041]">Player details</Text>
                  <Text className="text-xs font-bold text-slate-400">Editable roster identity</Text>
                </View>
              </View>
            </View>

            <View className="gap-5">
              <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: 14 }}>
                <View className="flex-1">
                  <FieldLabel>First name</FieldLabel>
                  <TextInput className="h-12 rounded-2xl border border-[#DFE8F3] bg-[#F8FBFF] px-5 py-0 font-bold text-slate-900" value={firstName} onChangeText={setFirstName} />
                </View>
                <View className="flex-1">
                  <FieldLabel>Last name</FieldLabel>
                  <TextInput className="h-12 rounded-2xl border border-[#DFE8F3] bg-[#F8FBFF] px-5 py-0 font-bold text-slate-900" value={lastName} onChangeText={setLastName} />
                </View>
              </View>

              <View>
                <FieldLabel>Email address</FieldLabel>
                <View className="relative">
                  <TextInput className="h-12 rounded-2xl border border-[#DFE8F3] bg-[#F8FBFF] pl-12 pr-5 py-0 font-bold text-slate-900" value={email} onChangeText={setEmail} placeholder="player@academy.com" keyboardType="email-address" />
                  <View pointerEvents="none" className="absolute bottom-0 left-5 top-0 justify-center">
                    <Mail color="#8BA0BC" size={17} />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: isCompact ? 'column' : 'row', gap: 14 }}>
                <View className="flex-1">
                  <FieldLabel>Birth year</FieldLabel>
                  <TextInput className="h-12 rounded-2xl border border-[#DFE8F3] bg-[#F8FBFF] px-5 py-0 font-bold text-slate-900" value={birthYear} onChangeText={setBirthYear} keyboardType="numeric" />
                </View>
                <View className="flex-1">
                  <FieldLabel>Jersey number</FieldLabel>
                  <View className="relative">
                    <TextInput className="h-12 rounded-2xl border border-[#DFE8F3] bg-[#F8FBFF] pl-12 pr-5 py-0 font-black text-[#123B95]" value={number} onChangeText={setNumber} keyboardType="numeric" />
                    <View pointerEvents="none" className="absolute bottom-0 left-5 top-0 justify-center">
                      <Hash color="#8BA0BC" size={17} />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-7 rounded-[24px] border border-red-100 bg-red-50/50 p-4" style={{ flexDirection: isCompact ? 'column' : 'row', gap: 14, alignItems: isCompact ? 'flex-start' : 'center' }}>
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white">
                <Info color="var(--c-danger)" size={18} />
              </View>
              <View className="flex-1">
                <Text className="font-black text-slate-900">Danger Zone</Text>
                <Text className="mt-1 text-[11px] font-bold text-slate-500">Once removed, all data is archived.</Text>
              </View>
              <TouchableOpacity className="h-10 items-center justify-center rounded-2xl border border-red-200 bg-white px-5">
                <Text className="text-[10px] font-black uppercase tracking-widest text-red-600">Remove player</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="w-full gap-4 md:w-[410px]">
            <View className="rounded-[30px] border border-[#E1EAF5] bg-white p-5 shadow-sm">
              <View className="mb-5 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className={`h-11 w-11 items-center justify-center rounded-2xl ${isMedicalValid ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <Activity color={isMedicalValid ? 'var(--c-success)' : 'var(--c-danger)'} size={20} />
                  </View>
                  <View>
                    <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medical visa</Text>
                    <Text className="text-lg font-black text-[#0E2041]">Compliance</Text>
                  </View>
                </View>
                <AdminStatusPill label={isMedicalValid ? 'Valid' : 'Expired'} tone={isMedicalValid ? 'emerald' : 'red'} />
              </View>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} className="rounded-[22px] border border-[#E8EEF7] bg-[#F8FBFF] p-4">
                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expires</Text>
                <Text className="mt-1 text-2xl font-black text-[#0E2041]">{medicalExpiry ? new Date(medicalExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Set Date'}</Text>
                <View className="mt-3 flex-row items-center">
                  <Calendar size={13} color="#8BA0BC" />
                  <Text className="ml-2 text-[11px] font-bold text-slate-400">Last check: {medicalExpiry || 'N/A'}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View className="rounded-[30px] border border-[#E1EAF5] bg-white p-5 shadow-sm">
              <View className="mb-5 flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className={`h-11 w-11 items-center justify-center rounded-2xl ${paymentTone === 'blue' ? 'bg-blue-50' : 'bg-orange-50'}`}>
                    <CreditCard color={paymentTone === 'blue' ? 'var(--c-blue)' : 'var(--c-warning)'} size={20} />
                  </View>
                  <View>
                    <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">{feesName}</Text>
                    <Text className="text-lg font-black text-[#0E2041]">Finance</Text>
                  </View>
                </View>
                <AdminStatusPill label={paymentStatusDisplay} tone={paymentTone} />
              </View>
              <View className="rounded-[22px] border border-[#E8EEF7] bg-[#F8FBFF] p-4">
                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">{amountDue > 0 ? 'Outstanding' : 'Paid amount'}</Text>
                <Text className="mt-1 text-3xl font-black text-[#0E2041]">{formatMoney(displayedPaymentAmount)}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTransactions(true)} className="mt-4 h-11 flex-row items-center justify-center rounded-2xl bg-[#EEF4FF] px-5">
                <Text className="text-[10px] font-black uppercase tracking-widest text-[#123B95]">View transactions</Text>
                <ChevronRight color="var(--c-brand-fg)" size={15} />
              </TouchableOpacity>
            </View>

            <View className="rounded-[30px] border border-[#E1EAF5] bg-[#0E2041] p-5 shadow-sm">
              <View className="mb-4 flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                  <Shield color="#FFFFFF" size={18} />
                </View>
                <View>
                  <Text className="text-[10px] font-black uppercase tracking-widest text-blue-200">Admin snapshot</Text>
                  <Text className="text-lg font-black text-white">Ready for staff review</Text>
                </View>
              </View>
              <View className="gap-3">
                <View className="flex-row items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <Text className="text-xs font-bold text-blue-100">Roster identity</Text>
                  <Text className="text-xs font-black text-white">{profileCompletion >= 70 ? 'Good' : 'Incomplete'}</Text>
                </View>
                <View className="flex-row items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                  <Text className="text-xs font-bold text-blue-100">Medical status</Text>
                  <Text className="text-xs font-black text-white">{isMedicalValid ? 'Cleared' : 'Action needed'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Attendance Calendar Modal */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <Pressable 
          className="flex-1 bg-black/40 justify-center items-center p-6"
          onPress={() => setShowCalendar(false)}
        >
          <View className="bg-white rounded-[40px] w-full max-w-lg p-8 shadow-2xl">
             <View className="flex-row justify-between items-center mb-6">
                <View>
                   <Text className="text-2xl font-black text-slate-900 tracking-tight">Match Presence Log</Text>
                   <Text className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">Player Statistics</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCalendar(false)} className="w-10 h-10 bg-slate-50 rounded-xl items-center justify-center">
                   <X color="var(--c-faint)" size={20} />
                </TouchableOpacity>
             </View>

             {/* Simple Calendar Grid */}
             <View className="flex-row flex-wrap gap-2 mb-8">
                {[...Array(30)].map((_, i) => (
                  <View 
                    key={i} 
                    className={`w-10 h-10 rounded-xl items-center justify-center border ${i < 20 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}
                  >
                     <Text className={`font-bold text-[10px] ${i < 20 ? 'text-emerald-600' : 'text-slate-400'}`}>{i + 1}</Text>
                     {i < 20 && <View className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />}
                  </View>
                ))}
             </View>

             <View className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex-row items-center">
                <Info color="var(--c-brand-fg)" size={16} />
                <Text className="text-xs text-slate-600 font-bold ml-3 italic">Mock calendar view for illustration.</Text>
             </View>
          </View>
        </Pressable>
      </Modal>

      {/* Date Picker Modal (Simplified) */}
      <Modal visible={showDatePicker} transparent animationType="slide">
         <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-white rounded-t-[40px] p-8">
               <View className="flex-row justify-between items-center mb-8">
                  <Text className="text-2xl font-black text-slate-900">Set Expiry Date</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                     <X color="black" size={24} />
                  </TouchableOpacity>
               </View>

               <View className="space-y-4">
                  <Text className="text-slate-500 font-bold text-xs uppercase tracking-widest">Enter valid until date (YYYY-MM-DD)</Text>
                  <TextInput 
                    className="bg-slate-100 rounded-2xl px-6 py-4 font-bold text-lg"
                    placeholder="2025-09-12"
                    value={medicalExpiry}
                    onChangeText={setMedicalExpiry}
                  />
                  
                  <TouchableOpacity 
                    onPress={() => setShowDatePicker(false)}
                    className="bg-[#1D3E90] h-16 rounded-2xl items-center justify-center shadow-lg mt-4"
                  >
                    <Text className="text-white font-black uppercase tracking-widest">Confirm Date</Text>
                  </TouchableOpacity>
               </View>
            </View>
         </View>
      </Modal>

      <Modal visible={showTransactions} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/40 justify-center items-center p-6" onPress={() => setShowTransactions(false)}>
          <Pressable className="bg-white rounded-[32px] w-full max-w-lg p-6" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row items-center justify-between mb-5">
              <View>
                <Text className="text-xl font-black text-[#1E293B]">Transactions</Text>
                <Text className="text-slate-400 text-xs font-bold mt-1">{firstName} {lastName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTransactions(false)} className="w-10 h-10 rounded-2xl bg-slate-100 items-center justify-center">
                <X color="var(--c-ink-soft)" size={18} />
              </TouchableOpacity>
            </View>

            {paymentTransactions.length ? (
              <View className="gap-3">
                {paymentTransactions.map((transaction) => (
                  <View key={transaction.id} className="rounded-2xl border border-slate-100 bg-[#F8FAFC] p-4 flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <Text className="font-black text-slate-900">{transaction.label}</Text>
                      <Text className="text-slate-400 text-xs font-bold mt-1">
                        {new Date(transaction.date).toLocaleDateString('ro-RO')} • {transaction.status === 'success' ? 'Paid' : 'Failed'}
                      </Text>
                    </View>
                    <Text className="font-black text-[#1D3E90]">{formatMoney(transaction.amount, transaction.currency)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View className="rounded-2xl bg-slate-50 border border-slate-100 p-6 items-center">
                <Text className="font-black text-slate-700">No transactions yet.</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}
