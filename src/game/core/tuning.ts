export interface SnowTuning {
  baseSnowHeight: number;
  pileHeightScale: number;
  cutStrength: number;
  compactionRatio: number;
  forwardWeight: number;
  forwardApronWeight: number;
  sideBankWeight: number;
  sideBankHeight: number;
  sideBankInnerWidth: number;
  sideBankOuterWidth: number;
  sideBankLength: number;
  sideBermShare: number;
  sideBermDistance: number;
}

export interface VehicleTuning {
  forwardEngineForce: number;
  maxForwardSpeed: number;
  reverseEngineForce: number;
  maxReverseSpeed: number;
  frontLoadDivisor: number;
  frontLoadDragStrength: number;
  frontLoadEngineStrength: number;
  frontLoadResistanceStrength: number;
  frontLoadMaxSpeedStrength: number;
  frontLoadStopThreshold: number;
  frontLoadStopStrength: number;
}

export interface GameplayTuning {
  snow: SnowTuning;
  vehicle: VehicleTuning;
}

export function createDefaultGameplayTuning(): GameplayTuning {
  return {
    snow: {
      baseSnowHeight: 0.71,
      pileHeightScale: 1.09,
      cutStrength: 6.4,
      compactionRatio: 0.76,
      forwardWeight: 0.56,
      forwardApronWeight: 0.2,
      sideBankWeight: 0.58,
      sideBankHeight: 1.18,
      sideBankInnerWidth: 3.2,
      sideBankOuterWidth: 6.4,
      sideBankLength: 4.8,
      sideBermShare: 0.68,
      sideBermDistance: 2.8,
    },
    vehicle: {
      forwardEngineForce: 33.1,
      maxForwardSpeed: 5.9,
      reverseEngineForce: 16.6,
      maxReverseSpeed: 8.7,
      frontLoadDivisor: 1.39,
      frontLoadDragStrength: 0.62,
      frontLoadEngineStrength: 0.68,
      frontLoadResistanceStrength: 0.8,
      frontLoadMaxSpeedStrength: 0.76,
      frontLoadStopThreshold: 0.25,
      frontLoadStopStrength: 4.0,
    },
  };
}

export function cloneGameplayTuning(source: GameplayTuning): GameplayTuning {
  return {
    snow: { ...source.snow },
    vehicle: { ...source.vehicle },
  };
}
