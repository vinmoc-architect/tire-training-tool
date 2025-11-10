export type SegmentPoint = {
  x: number;
  y: number;
  label: 0 | 1;
};

export type BoundaryPolygon = {
  points: Array<{ x: number; y: number }>;
};
