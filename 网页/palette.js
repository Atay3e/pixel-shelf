// T134 货架的限色表：每一组是一条从暗到亮的色阶，暗部往红棕偏（不用冷青）。
// 整张画面最后都量化到这些颜色上，像素才干净。
export const RAMPS = {
  line: ["#22120b"],
  walnut: ["#2b170e", "#45261a", "#633923", "#80502f", "#9c6a40"],
  honey: ["#7a4a26", "#a46c3a", "#c98f52", "#e0ad6c", "#f0c98e"],
  oak: ["#8c6646", "#a98058", "#c49a6e", "#d8b287", "#e8c9a0"], // 格子里的背板
  cream: ["#c9ad85", "#dfc79f", "#eddcb9", "#f7ecd3", "#fff8e8"],
  glow: ["#f9e6c0", "#fbdfa9", "#fdd690"], // 台灯照到奶油墙上的几圈光
  yellow: ["#9a6410", "#d0901c", "#f2b22e", "#ffc83d", "#ffde7a", "#fff1bd"],
  khaki: ["#8a7238", "#b39a55", "#d8c27a", "#efe2a8"],
  orange: ["#7d3814", "#b5561e", "#e07a2c", "#f6a14c", "#ffc68e"],
  red: ["#5c1c14", "#8e2c1e", "#c0432c", "#e2694c"],
  green: ["#26391b", "#3e5c24", "#5f8b30", "#8bb83e", "#b9da64"],
  sea: ["#8c4c4e", "#bf716a", "#e6a08c", "#f6c6aa", "#ffe2cc"],
  grey: ["#2b2622", "#4b443e", "#7b726a", "#a99f95", "#d7cec3", "#f3ede4"],
  black: ["#140d0a", "#251b16", "#3a2d26"],
  skin: ["#d89b72", "#f3c79e"],
};
export const PALETTE_HEX = Object.values(RAMPS).flat();
export const PALETTE = PALETTE_HEX.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
