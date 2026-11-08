export function publicAssetUrl(assetPath, baseUrl = import.meta.env.BASE_URL) {
  return `${baseUrl}${assetPath.replace(/^\/+/, '')}`;
}
