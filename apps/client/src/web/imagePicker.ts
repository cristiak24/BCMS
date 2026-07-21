import { getDocumentAsync } from './documentPicker';

export const MediaTypeOptions = {
  Images: 'Images',
};

export async function requestMediaLibraryPermissionsAsync() {
  return { granted: true, status: 'granted' };
}

export async function launchImageLibraryAsync() {
  return getDocumentAsync({ type: 'image/*', multiple: false });
}

