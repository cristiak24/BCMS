import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import * as DocumentPicker from '@/src/web/documentPicker';
import * as ImagePicker from '@/src/web/imagePicker';
import { profileApi } from '../../services/profileApi';

type ProfileImagePickerProps = {
  avatarUrl: string | null | undefined;
  initials: string;
  onUploaded: (avatarUrl: string) => void;
  onError?: (message: string) => void;
};

function getExtensionFromUri(uri: string) {
  const withoutQuery = uri.split('?')[0];
  const parts = withoutQuery.split('.');
  return parts.length > 1 ? `.${parts.pop()}` : '.jpg';
}

export default function ProfileImagePicker({
  avatarUrl,
  initials,
  onUploaded,
  onError,
}: ProfileImagePickerProps) {
  const [uploading, setUploading] = useState(false);

  const handlePickImage = async () => {
    let asset: { uri: string; file?: File; fileName?: string | null; mimeType?: string | null } | null = null;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.granted) {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.85,
          aspect: [1, 1],
        });

        if (!result.canceled && result.assets?.length) {
          const picked = result.assets[0];
          if (picked.uri) {
            asset = {
              uri: picked.uri,
              file: (picked as any).file,
              fileName: picked.fileName,
              mimeType: picked.mimeType,
            };
          }
        }
      }
    } catch {
      // Fall back to the installed document picker if the optional image picker package is unavailable.
    }

    if (!asset) {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/*'],
          multiple: false,
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) {
          return;
        }

        const picked = result.assets[0];
        if (picked.uri) {
          asset = {
            uri: picked.uri,
            file: (picked as any).file,
            fileName: picked.name,
            mimeType: picked.mimeType,
          };
        }
      } catch {
        onError?.('Accesul la galeria media este necesar pentru a actualiza fotografia de profil.');
        return;
      }
    }

    if (!asset) {
      onError?.('Imaginea selectată nu a putut fi citită.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      const fileName = asset.fileName || `avatar${getExtensionFromUri(asset.uri)}`;
      if (asset.file) {
        formData.append('image', asset.file, fileName);
      } else {
        formData.append('image', {
          uri: asset.uri,
          name: fileName,
          type: asset.mimeType || 'image/jpeg',
        } as any);
      }

      const response = await profileApi.uploadAvatar(formData);
      onUploaded(response.avatarUrl);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Nu s-a putut încărca avatarul.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePickImage}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={avatarUrl ? 'Schimbă fotografia de profil' : 'Adaugă o fotografie de profil'}
      className="ui-press relative self-start"
    >
      {/* Ring is the card surface colour, not white, so the avatar sits cleanly
          on the cover band in dark mode too. */}
      <View
        className="w-[76px] h-[76px] md:w-[88px] md:h-[88px] rounded-full border-[3px] overflow-hidden items-center justify-center"
        style={{ backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-surface)', boxShadow: 'var(--e-md)' } as any}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} className="w-full h-full" />
        ) : (
          <Text className="f-display text-[26px] font-extrabold" style={{ color: 'var(--c-brand-fg)', letterSpacing: '-0.5px' } as any}>{initials}</Text>
        )}
      </View>

      <View
        className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full border-[3px] items-center justify-center"
        style={{ backgroundColor: 'var(--c-brand-surface)', borderColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialIcons name="photo-camera" size={14} color="var(--c-on-brand)" />
        )}
      </View>
    </Pressable>
  );
}
