import { getDocumentAsync } from './documentPicker';

export const MediaTypeOptions = {
  Images: 'Images',
};

export async function requestMediaLibraryPermissionsAsync() {
  return { granted: true, status: 'granted' };
}

/** Options are native-only (cropping, quality); the web picker ignores them. */
export async function launchImageLibraryAsync(_options?: {
  mediaTypes?: string;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
}) {
  return getDocumentAsync({ type: 'image/*', multiple: false });
}

