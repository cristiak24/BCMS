import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { clubDocumentsApi, type ClubDocument, type ClubDocumentList, type ClubDocumentVisibility } from '../../services/clubDocumentsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../HeaderContext';
import PageContainer from '../ui/PageContainer';
import PageHero, { GlassStat } from '../admin/PageHero';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';

/**
 * "Documente" — the club's PDF library, one screen for every role (admin
 * /admin/documents, coach + player + parent /documents). Admins and coaches
 * upload; "Doar staff" documents never reach players or parents (the server
 * filters them, this screen just labels them).
 */

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function titleFromFileName(name: string) {
  return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
}

const VISIBILITY_OPTIONS: { key: ClubDocumentVisibility; label: string; hint: string }[] = [
  { key: 'all', label: 'Toți membrii', hint: 'Jucători, părinți, antrenori' },
  { key: 'staff', label: 'Doar staff', hint: 'Admini și antrenori' },
];

function UploadPanel({
  file,
  maxFileBytes,
  onCancel,
  onUploaded,
  onError,
}: {
  file: File;
  maxFileBytes: number;
  onCancel: () => void;
  onUploaded: (doc: ClubDocument) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(() => titleFromFileName(file.name));
  const [visibility, setVisibility] = useState<ClubDocumentVisibility>('all');
  const [uploading, setUploading] = useState(false);
  const tooBig = file.size > maxFileBytes;

  const submit = async () => {
    if (tooBig || uploading) return;
    setUploading(true);
    try {
      onUploaded(await clubDocumentsApi.upload(file, title.trim(), visibility));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Încărcarea a eșuat.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View
      className="ui-rise rounded-[16px] border p-4 md:p-5 mb-4 gap-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-brand-fg)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-3 min-w-0">
        <View className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-danger-bg)' }}>
          <MaterialIcons name="picture-as-pdf" size={19} color="var(--c-danger-fg)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{file.name}</Text>
          <Text className="t-meta" style={{ color: tooBig ? 'var(--c-danger-fg)' : 'var(--c-muted)' }}>
            {formatBytes(file.size)}{tooBig ? ` — depășește limita de ${formatBytes(maxFileBytes)}` : ''}
          </Text>
        </View>
      </View>

      <View className="flex-col md:flex-row gap-4">
        <View className="flex-1 min-w-0">
          <Text className="t-eyebrow mb-1.5" style={{ color: 'var(--c-faint)' }}>Titlu</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            accessibilityLabel="Titlul documentului"
            placeholder="ex. Regulament intern 2026"
            placeholderTextColor="var(--c-faint)"
            className="h-11 rounded-[11px] border px-3 text-[14px] font-medium outline-none w-full"
            style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
          />
        </View>
        <View>
          <Text className="t-eyebrow mb-1.5" style={{ color: 'var(--c-faint)' }}>Cine îl vede</Text>
          <View className="flex-row p-[3px] rounded-[11px]" style={{ backgroundColor: 'var(--c-surface-3)' }}>
            {VISIBILITY_OPTIONS.map((option) => {
              const active = visibility === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setVisibility(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${option.label}: ${option.hint}`}
                  className="flex-1 md:flex-none h-[38px] px-4 rounded-[8px] items-center justify-center"
                  style={{ backgroundColor: active ? 'var(--c-surface)' : 'transparent', boxShadow: active ? 'var(--e-sm)' : 'none' } as any}
                >
                  <Text className="text-[13px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View className="flex-row justify-end gap-2">
        <Pressable onPress={onCancel} disabled={uploading} accessibilityRole="button" className="ui-press h-10 px-4 rounded-[10px] items-center justify-center">
          <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Anulează</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={tooBig || uploading}
          accessibilityRole="button"
          className="ui-press h-10 px-4 rounded-[10px] flex-row items-center gap-1.5"
          style={{ backgroundColor: 'var(--c-brand-surface)', opacity: tooBig || uploading ? 0.6 : 1 } as any}
        >
          {uploading ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="upload-file" size={16} color="var(--c-on-brand)" />}
          <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Încarcă</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DocumentCard({
  doc,
  busy,
  onOpen,
  onDownload,
  onDelete,
}: {
  doc: ClubDocument;
  busy: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const meta = [formatBytes(doc.sizeBytes), formatDate(doc.createdAt), doc.uploaderName].filter(Boolean).join(' · ');
  return (
    <View
      className="ui-lift rounded-[14px] border p-3 flex-row items-center gap-3 min-w-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Deschide ${doc.title}`}
        className="ui-press flex-1 min-w-0 flex-row items-center gap-3 text-left"
      >
        <View className="w-11 h-11 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-danger-bg)' }}>
          {busy ? <ActivityIndicator size="small" color="var(--c-danger-fg)" /> : <MaterialIcons name="picture-as-pdf" size={20} color="var(--c-danger-fg)" />}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="f-display text-[14.5px] font-bold" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.01em' } as any} numberOfLines={2}>{doc.title}</Text>
          <View className="flex-row items-center gap-2 mt-0.5 min-w-0">
            {doc.visibility === 'staff' ? (
              <View className="rounded-full px-2 py-px shrink-0" style={{ backgroundColor: 'var(--c-purple-bg)' }}>
                <Text className="text-[11px] font-bold" style={{ color: 'var(--c-purple-fg)' }}>Doar staff</Text>
              </View>
            ) : null}
            <Text className="t-meta flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{meta}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={onDownload}
        accessibilityRole="button"
        accessibilityLabel={`Descarcă ${doc.title}`}
        className="ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0"
        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
      >
        <MaterialIcons name="download" size={16} color="var(--c-ink-soft)" />
      </Pressable>
      {doc.canDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Șterge ${doc.title}`}
          className="ui-press w-9 h-9 rounded-[10px] items-center justify-center shrink-0"
        >
          <MaterialIcons name="delete-outline" size={17} color="var(--c-faint)" />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function DocumentsScreen() {
  const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
  const { toasts, showToast, dismissToast } = useToasts();
  const [data, setData] = useState<ClubDocumentList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClubDocument | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSearchPlaceholder('Caută documente…');
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await clubDocumentsApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca documentele.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    const docs = data?.documents ?? [];
    return query ? docs.filter((doc) => `${doc.title} ${doc.fileName}`.toLowerCase().includes(query)) : docs;
  }, [data, searchValue]);

  const pickFile = () => inputRef.current?.click();

  const onFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      showToast({ variant: 'error', message: 'Sunt acceptate doar fișiere PDF.' });
      return;
    }
    setPending(file);
  };

  const open = async (doc: ClubDocument) => {
    // Open the tab inside the tap, before any await — otherwise popup blockers
    // eat it. It then loads a short-lived signed URL rather than a blob:, which
    // an installed iOS web app cannot hand over to Safari's PDF viewer.
    const tab = window.open('about:blank', '_blank');
    setBusyId(doc.id);
    try {
      const url = await clubDocumentsApi.openUrl(doc.id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut deschide documentul.' });
    } finally {
      setBusyId(null);
    }
  };

  const download = async (doc: ClubDocument) => {
    setBusyId(doc.id);
    try {
      const url = URL.createObjectURL(await clubDocumentsApi.file(doc.id));
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Descărcarea a eșuat.' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc: ClubDocument) => {
    try {
      await clubDocumentsApi.remove(doc.id);
      setData((current) => current && {
        ...current,
        documents: current.documents.filter((item) => item.id !== doc.id),
        usedBytes: Math.max(0, current.usedBytes - doc.sizeBytes),
      });
      showToast({ variant: 'success', message: `„${doc.title}” a fost șters.` });
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut șterge documentul.' });
    }
  };

  const canUpload = Boolean(data?.canUpload);
  const usedPercent = data ? Math.min(100, Math.round((data.usedBytes / data.quotaBytes) * 100)) : 0;

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-32" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <PageHero
            eyebrow="Documente"
            title="Biblioteca clubului"
            subtitle="Regulamente, formulare și alte PDF-uri ale clubului."
            actions={canUpload ? <Button label="Încarcă PDF" icon="upload-file" variant="primary" onPress={pickFile} /> : undefined}
          >
            {data ? (
              <View className="grid grid-cols-2 gap-2 max-w-[440px] ui-stagger">
                <GlassStat value={data.documents.length} label={data.documents.length === 1 ? 'document' : 'documente'} dot="var(--c-brand-fg)" />
                {canUpload ? (
                  <GlassStat
                    value={formatBytes(data.usedBytes)}
                    label={`din ${formatBytes(data.quotaBytes)}`}
                    dot={usedPercent > 85 ? 'var(--c-warning)' : 'var(--c-success)'}
                    bar={usedPercent}
                  />
                ) : null}
              </View>
            ) : null}
          </PageHero>

          {/* Native picker; the visible button above opens it. */}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={onFileChosen} style={{ display: 'none' }} aria-hidden="true" />

          {pending && data ? (
            <UploadPanel
              key={`${pending.name}-${pending.lastModified}`}
              file={pending}
              maxFileBytes={data.maxFileBytes}
              onCancel={() => setPending(null)}
              onError={(message) => showToast({ variant: 'error', message })}
              onUploaded={(doc) => {
                setPending(null);
                setData((current) => current && { ...current, documents: [doc, ...current.documents], usedBytes: current.usedBytes + doc.sizeBytes });
                showToast({ variant: 'success', message: `„${doc.title}” a fost încărcat.` });
              }}
            />
          ) : null}

          {error ? (
            <ErrorState title="Nu am putut încărca documentele" message={error} actionLabel="Reîncearcă" onAction={load} />
          ) : !data ? (
            <View className="grid grid-cols-1 lg:grid-cols-2 gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă documentele">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[72px] w-full rounded-[14px]" />)}
            </View>
          ) : (
            <>
              {data.documents.length === 0 ? (
                <View className="rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                  <EmptyState
                    icon="folder"
                    title="Niciun document încă"
                    message={canUpload ? 'Încarcă regulamentul, formularele sau orice PDF util membrilor clubului.' : 'Documentele publicate de club vor apărea aici.'}
                    actionLabel={canUpload ? 'Încarcă PDF' : undefined}
                    onAction={canUpload ? pickFile : undefined}
                  />
                </View>
              ) : visible.length === 0 ? (
                <EmptyState compact icon="search-off" title="Niciun document găsit" message={`Nimic pentru „${searchValue.trim()}”.`} actionLabel="Arată toate" onAction={() => setSearchValue('')} />
              ) : (
                <View className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2.5 ui-stagger">
                  {visible.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      busy={busyId === doc.id}
                      onOpen={() => open(doc)}
                      onDownload={() => download(doc)}
                      onDelete={() => setConfirmDelete(doc)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </PageContainer>
      </ScrollView>

      <ConfirmDialog
        visible={confirmDelete != null}
        destructive
        icon="delete-outline"
        title={confirmDelete ? `Ștergi „${confirmDelete.title}”?` : ''}
        message="Documentul dispare pentru toți membrii clubului."
        confirmLabel="Șterge"
        cancelLabel="Anulează"
        onConfirm={() => {
          if (confirmDelete) void remove(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
