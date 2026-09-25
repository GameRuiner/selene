const superscriptDigits: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export function formatMass(massKg: number): string {
  const exponent = Math.floor(Math.log10(massKg));
  const coefficient = massKg / 10 ** exponent;
  const power = String(exponent).split('').map((digit) => superscriptDigits[digit]).join('');
  return `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 7 }).format(coefficient)} × 10${power} kg`;
}
export function formatKilometers(kilometers: number): string {
  if (kilometers < 1) return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(kilometers * 1_000)} m`;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(kilometers)} km`;
}
