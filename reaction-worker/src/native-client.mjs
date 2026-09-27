const NATIVE_CLIENTS = new Set(['onomatoi-ios', 'onomatoi-play-ios']);

export function requestAccess(origin, client, allowedOrigins) {
  const webAllowed = Boolean(origin) && allowedOrigins.split(',').includes(origin);
  // URLSession has no Origin. The client label is a routing hint, not a secret;
  // the existing Durable Object quota remains the abuse and cost boundary.
  const nativeAllowed = !origin && NATIVE_CLIENTS.has(client);
  return { webAllowed, allowed: webAllowed || nativeAllowed };
}
