export function createURL(path = '/') {
  return new URL(path, window.location.origin).toString();
}

export async function openURL(url: string) {
  window.location.assign(url);
}

