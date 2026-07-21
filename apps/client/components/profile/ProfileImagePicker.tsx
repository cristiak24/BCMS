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
        onError?.('Media library access is required to update the profile photo.');
        return;
      }
    }

    if (!asset) {
      onError?.('Unable to read the selected image.');
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
      onError?.(error instanceof Error ? error.message : 'Failed to upload avatar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePickImage}
      disabled={uploading}
      className="relative self-start"
    >
      <View className="w-24 h-24 rounded-full bg-[#EBF1FF] border-4 border-white shadow-lg overflow-hidden items-center justify-center">
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} className="w-full h-full" />
        ) : (
          <Text className="text-[#1D3E90] text-2xl font-black tracking-tight">{initials}</Text>
        )}
      </View>

      <View className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#1D3E90] border-2 border-white items-center justify-center shadow-md">
        {uploading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <MaterialIcons name="photo-camera" size={18} color="#ffffff" />
        )}
      </View>
    </Pressable>
  );
}
