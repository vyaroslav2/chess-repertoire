const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function isValidUciMove(value: unknown): value is string {
  if (typeof value !== "string" || !UCI_MOVE_PATTERN.test(value)) return false;
  if (value.slice(0, 2) === value.slice(2, 4)) return false;
  if (value.length === 4) return true;

  return (value[1] === "7" && value[3] === "8") ||
    (value[1] === "2" && value[3] === "1");
}
