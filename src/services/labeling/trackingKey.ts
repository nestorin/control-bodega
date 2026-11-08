import type { TrackingKeyComponents } from "@/types/labeling";

const TRACKING_KEY_SEPARATOR = "|";

function normalizeComponent(value: string, name: keyof TrackingKeyComponents): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("trackingKey components must not be empty");
  }
  if (normalized.includes(TRACKING_KEY_SEPARATOR)) {
    throw new Error(`${name} must not contain '${TRACKING_KEY_SEPARATOR}'`);
  }
  return name === "lotKey" ? normalized.toUpperCase() : normalized;
}

export function buildTrackingKey(productId: string, lot: string, expiry: string): string {
  return [
    normalizeComponent(productId, "productId"),
    normalizeComponent(lot, "lotKey"),
    normalizeComponent(expiry, "expiryKey"),
  ].join(TRACKING_KEY_SEPARATOR);
}

export function normalizeTrackingKey(value: string): string {
  const components = value.split(TRACKING_KEY_SEPARATOR);
  if (components.length !== 3) {
    throw new Error("trackingKey must contain productId, lot, and expiry");
  }
  return buildTrackingKey(components[0], components[1], components[2]);
}
