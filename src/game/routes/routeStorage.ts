import type { RouteDefinition } from '../core/types';
import { getWorldComboPresetById } from '../levels/worldPresets';

const ROUTE_STORAGE_PREFIX = 'plough.route.';

export function getStoredRouteDefinition(worldComboId: string): RouteDefinition | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(`${ROUTE_STORAGE_PREFIX}${worldComboId}`);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RouteDefinition;
    return sanitizeRouteDefinition(parsed, worldComboId);
  } catch (error) {
    console.warn('Failed to parse stored route definition', error);
    return null;
  }
}

export function saveStoredRouteDefinition(routeDefinition: RouteDefinition): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    `${ROUTE_STORAGE_PREFIX}${routeDefinition.worldComboId}`,
    JSON.stringify(routeDefinition),
  );
}

export function clearStoredRouteDefinition(worldComboId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(`${ROUTE_STORAGE_PREFIX}${worldComboId}`);
}

export function resolveRouteDefinition(worldComboId: string): RouteDefinition | null {
  return getStoredRouteDefinition(worldComboId) ?? getWorldComboPresetById(worldComboId).routeDefinition ?? null;
}

function sanitizeRouteDefinition(routeDefinition: RouteDefinition, worldComboId: string): RouteDefinition | null {
  if (!Array.isArray(routeDefinition.points)) {
    return null;
  }

  const points = routeDefinition.points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))
    .map((point) => ({
      x: Number(point.x),
      y: Number(point.y),
      z: Number(point.z),
    }));

  return {
    worldComboId,
    label: routeDefinition.label || `${worldComboId} Route`,
    closed: Boolean(routeDefinition.closed),
    width: Math.max(4, Number(routeDefinition.width) || 14),
    gateSpacing: Math.max(8, Number(routeDefinition.gateSpacing) || 20),
    points,
  };
}
