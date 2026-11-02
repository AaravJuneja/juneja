export type TrainSkinPattern = "checks" | "galaxy" | "dots" | "abstract" | "crystal" | "static" | "lightning" | "sparkle" | "matrix" | "leaves" | "stars" | "animal" | "foil" | "gradient";

export interface TrainSkin {
  readonly id: string;
  readonly label: string;
  readonly colors: readonly [string, string];
  readonly pattern?: TrainSkinPattern;
}

export const skins = [
  { id: "error", label: "Error", colors: ["#f04452", "#27121d"], pattern: "static" },
  { id: "aurora", label: "Aurora", colors: ["#47f4bb", "#325cc9"], pattern: "gradient" },
  { id: "pastel-rainbow", label: "Pastel Rainbow", colors: ["#ffd3e6", "#85d4ff"], pattern: "gradient" },
  { id: "blue-checkers", label: "Blue Checkers", colors: ["#4169e1", "#142649"], pattern: "checks" },
  { id: "galaxy", label: "Galaxy", colors: ["#2b174f", "#ee83e5"], pattern: "galaxy" },
  { id: "chocolate", label: "Chocolate", colors: ["#805033", "#f2bf83"] },
  { id: "cheetah", label: "Cheetah", colors: ["#d58b31", "#4d2a18"], pattern: "animal" },
  { id: "aurora-rainbow", label: "Aurora Rainbow", colors: ["#42edca", "#ed79e7"], pattern: "gradient" },
  { id: "cheese", label: "Cheese", colors: ["#ffdf43", "#fff0a7"], pattern: "dots" },
  { id: "abstract", label: "Abstract", colors: ["#da7df2", "#3527a0"], pattern: "abstract" },
  { id: "space-aurora", label: "Space Aurora", colors: ["#4c34a7", "#5ce7cf"], pattern: "galaxy" },
  { id: "green-crystal", label: "Green Crystal", colors: ["#41db94", "#116c55"], pattern: "crystal" },
  { id: "purple-crystal", label: "Purple Crystal", colors: ["#b38dff", "#482488"], pattern: "crystal" },
  { id: "diamond", label: "Diamond", colors: ["#e2ffff", "#69bacc"], pattern: "crystal" },
  { id: "static", label: "Static", colors: ["#dad6df", "#524d5a"], pattern: "static" },
  { id: "lightning", label: "Lightning", colors: ["#ffe14a", "#f5f5ff"], pattern: "lightning" },
  { id: "sparkle-time-yellow", label: "Sparkle Time Yellow", colors: ["#ffe36b", "#e77626"], pattern: "sparkle" },
  { id: "matrix", label: "Matrix", colors: ["#28ed80", "#0b3824"], pattern: "matrix" },
  { id: "sparkle-time-blue", label: "Sparkle Time Blue", colors: ["#64baff", "#6144ed"], pattern: "sparkle" },
  { id: "vantablack", label: "Vantablack", colors: ["#17151b", "#3f3644"] },
  { id: "sparkle-time-red", label: "Sparkle Time Red", colors: ["#ff596b", "#9e263d"], pattern: "sparkle" },
  { id: "leaves", label: "Leaves", colors: ["#6b9f3f", "#263a28"], pattern: "leaves" },
  { id: "night-stars", label: "Night Stars", colors: ["#242b5a", "#ffecaf"], pattern: "stars" },
  { id: "giraffe", label: "Giraffe", colors: ["#db9f48", "#512c22"], pattern: "animal" },
  { id: "purple-foil", label: "Purple Foil", colors: ["#c67aff", "#4b246c"], pattern: "foil" },
  { id: "bright-sky", label: "Bright Sky", colors: ["#58d7ff", "#f5fbff"], pattern: "gradient" },
  { id: "aqua", label: "Aqua", colors: ["#45ead7", "#197c93"] },
  { id: "yellow", label: "Yellow", colors: ["#ffdb45", "#b67724"] },
  { id: "red", label: "Red", colors: ["#f34051", "#74222f"] },
  { id: "white", label: "White", colors: ["#ffffff", "#c6ced8"] },
  { id: "teal", label: "Teal", colors: ["#29c7ac", "#126558"] },
  { id: "black", label: "Black", colors: ["#17171c", "#35333a"] },
  { id: "orange", label: "Orange", colors: ["#ff8e32", "#9c4724"] },
  { id: "brown", label: "Brown", colors: ["#a86c4e", "#4d3029"] },
  { id: "gray", label: "Gray", colors: ["#a1a4ad", "#555963"] },
  { id: "pink", label: "Pink", colors: ["#ff90c8", "#b54b83"] },
  { id: "purple", label: "Purple", colors: ["#b87cff", "#573286"] },
  { id: "green", label: "Green", colors: ["#63d873", "#207045"] },
  { id: "blue", label: "Blue", colors: ["#558dff", "#284a9d"] },
  { id: "rainbow", label: "Rainbow", colors: ["#ff626d", "#42d9c6"], pattern: "gradient" },
] as const satisfies readonly TrainSkin[];
