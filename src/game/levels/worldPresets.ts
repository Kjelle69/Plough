import type { RouteDefinition } from '../core/types';
import { noulajarviRoute } from '../routes/noulajarviRoute';

export interface WorldComboPreset {
  id: string;
  label: string;
  worldLabel: string;
  plowAreaLabel: string;
  description: string;
  routeDefinition?: RouteDefinition;
}

export const WORLD_COMBO_PRESETS: WorldComboPreset[] = [
  {
    id: 'noulajarvi-lake',
    label: 'Noulajarvi',
    worldLabel: 'Noulajarvi Lake',
    plowAreaLabel: 'Lake ice snow cover',
    description:
      'Current prototype combo: the Noulajarvi lake world with a masked plowable snow/ice surface on top of the lake.',
    routeDefinition: noulajarviRoute,
  },
];

export const DEFAULT_WORLD_COMBO_PRESET = WORLD_COMBO_PRESETS[0];

export function getWorldComboPresetById(id: string): WorldComboPreset {
  return WORLD_COMBO_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_WORLD_COMBO_PRESET;
}
