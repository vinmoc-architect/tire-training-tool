export const MASK_LABELS = ['OK', 'SHOULDER_IN', 'SHOULDER_OUT', 'BALS', 'UNEVEN'] as const;
export type MaskLabel = (typeof MASK_LABELS)[number];
