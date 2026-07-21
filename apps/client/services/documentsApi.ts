import { Platform } from '@/src/web/reactNative';
import * as FileSystem from '@/src/web/fileSystem';
import * as Sharing from '@/src/web/sharing';
import { apiFetch } from './apiClient';

export const documentsApi = {
    async generateL12AndShare(teamId: string, matchDetails: any, players: any[]) {
        try {
            const blob = await apiFetch<Blob>('/documents/generate-l12', {
                method: 'POST',
                body: JSON.stringify({ teamId, matchDetails, players }),
            }, 'blob');

            const reader = new FileReader();
            
            return new Promise((resolve, reject) => {
                reader.onloadend = async () => {
                    if (Platform.OS === 'web') {
                        // Web fallback download
                        const a = document.createElement('a');
                        a.href = reader.result as string; 
                        a.download = 'L12_List.pdf';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        resolve(true);
                        return;
                    }

                    const base64data = (reader.result as string).split(',')[1];
                    try {
                        const fileUri = `${FileSystem.documentDirectory}L12_List.pdf`;
                        await FileSystem.writeAsStringAsync(fileUri, base64data, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        
                        if (await Sharing.isAvailableAsync()) {
                            await Sharing.shareAsync(fileUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
                            resolve(true);
                        } else {
                            console.warn('Sharing not available on this device');
                            resolve(fileUri);
                        }
                    } catch (e) {
                        reject(e);
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

        } catch (error) {
            console.error('Error generating L12 on device:', error);
            throw error;
        }
    },

    async getL12Archive<T = any[]>() {
        try {
            return await apiFetch<T>('/documents/l12');
        } catch (error) {
            console.error('Error fetching L12 archive:', error);
            throw error;
        }
    }
};
