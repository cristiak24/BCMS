type PickerOptions = {
  type?: string | string[];
  multiple?: boolean;
};

function pickFile(options: PickerOptions = {}): Promise<any> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = Boolean(options.multiple);
    const accept = Array.isArray(options.type) ? options.type.join(',') : options.type;
    if (accept) input.accept = accept;

    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (!files.length) {
        resolve({ canceled: true, assets: [] });
        return;
      }

      resolve({
        canceled: false,
        assets: files.map((file) => ({
          file,
          mimeType: file.type,
          name: file.name,
          size: file.size,
          uri: URL.createObjectURL(file),
        })),
      });
    };

    input.click();
  });
}

export async function getDocumentAsync(options?: PickerOptions) {
  return pickFile(options);
}

