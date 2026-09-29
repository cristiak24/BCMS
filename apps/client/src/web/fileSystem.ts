export const documentDirectory = '';
export const EncodingType = {
  Base64: 'base64',
};

export async function writeAsStringAsync(_uri?: string, _contents?: string, _options?: { encoding?: string }) {
  throw new Error('FileSystem.writeAsStringAsync is not available in the web build.');
}

