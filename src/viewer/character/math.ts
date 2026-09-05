export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const fract = (value: number) => value - Math.floor(value);

// The single RNG for the whole project. Every layout, colour and physics
// perturbation derives from it so a replay is reproducible frame for frame.
export const seededRandom = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return fract(value);
};

export const easeOutCubic = (value: number) => {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
};

export const easeInOut = (value: number) => {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
};
