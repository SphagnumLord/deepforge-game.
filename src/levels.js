export const CAMPAIGN_LENGTH = 130;
export const THEMES = [
  { biome: "Медные предгорья", color: "#ce9764", glow: "#735036", material: 0 },
  { biome: "Изумрудные гроты", color: "#7bc5a8", glow: "#244e45", material: 1 },
  {
    biome: "Обсидиановый разлом",
    color: "#bba4c9",
    glow: "#453a50",
    material: 2,
  },
  { biome: "Лунные глубины", color: "#a4c4c6", glow: "#31525a", material: 3 },
];
export const TROPHIES = [
  {
    level: 15,
    boss: "Камнелоб",
    name: "Медный рог",
    kind: "horn",
    color: "#c09a6b",
    effect: "damage",
    value: 0.04,
    description: "+4% к урону",
  },
  {
    level: 30,
    boss: "Мшистый страж",
    name: "Изумрудный глаз",
    kind: "eye",
    color: "#91b79a",
    effect: "gold",
    value: 0.04,
    description: "+4% золота из блоков",
  },
  {
    level: 45,
    boss: "Пепельный клыкач",
    name: "Обсидиановый клык",
    kind: "fang",
    color: "#a9a1b8",
    effect: "discount",
    value: 0.03,
    description: "Кирки дешевле на 3%",
  },
  {
    level: 60,
    boss: "Лунный колосс",
    name: "Лунный осколок",
    kind: "crystal",
    color: "#b3ccc6",
    effect: "damage",
    value: 0.05,
    description: "+5% к урону",
  },
  {
    level: 75,
    boss: "Золотой панцирь",
    name: "Золотой щиток",
    kind: "shield",
    color: "#d6b879",
    effect: "gold",
    value: 0.05,
    description: "+5% золота из блоков",
  },
  {
    level: 90,
    boss: "Железный корень",
    name: "Сердцевина стража",
    kind: "root",
    color: "#b4ac85",
    effect: "hits",
    value: 1,
    description: "+1 удар каждому инструменту",
  },
  {
    level: 105,
    boss: "Хранитель кузни",
    name: "Клеймо мастера",
    kind: "seal",
    color: "#c8a47c",
    effect: "discount",
    value: 0.04,
    description: "Кирки дешевле на 4%",
  },
  {
    level: 120,
    boss: "Древний под горой",
    name: "Корона глубин",
    kind: "crown",
    color: "#c1c3aa",
    effect: "damage",
    value: 0.06,
    description: "+6% к урону",
  },
];
const names = [
  "Первый свет",
  "Старая штольня",
  "Медное сердце",
  "Тропа старателя",
  "Мшистый проход",
  "Тихая река",
  "Сад кристаллов",
  "Забытый колодец",
  "Тёмный порог",
  "Базальтовый свод",
  "Пепельная галерея",
  "Пульс горы",
  "Звёздная пыль",
  "Ледяная жила",
  "Северное сияние",
  "Лунный архив",
  "Эхо глубин",
  "Серебряный лабиринт",
  "Каменная летопись",
  "Подземный горизонт",
];
export const LEVELS = Array.from({ length: CAMPAIGN_LENGTH }, (_, index) => {
  const id = index + 1,
    challenge = id % 8 === 0,
    treasure = (id + 1) % 15 === 0;
  const trophy = TROPHIES.find((t) => t.level === id),
    theme = THEMES[Math.min(3, Math.floor(index / 33))];
  const kind = trophy
    ? "boss"
    : challenge
      ? "challenge"
      : treasure
        ? "treasure"
        : "normal";
  const title = trophy
    ? trophy.boss
    : treasure
      ? challenge
        ? "Золотое испытание"
        : "Золотая передышка"
      : challenge
        ? "Крепость породы"
        : names[index % names.length];
  return {
    id,
    ...theme,
    kind,
    challenge,
    treasure,
    boss: !!trophy,
    routes: challenge || trophy ? id >= 64 ? 3 : 2 : 1,
    trophy: trophy || null,
    name:
      id === CAMPAIGN_LENGTH
        ? "Сердце Deepforge"
        : `${title}${index >= names.length && !trophy ? ` · горизонт ${Math.floor(index / names.length) + 1}` : ""}`,
    seed: 8191 * id + 55,
    layout: index % 5,
    depthScale: (1 + index * 0.025) * 1.013 ** index,
    hpFactor: (challenge ? 2.75 : treasure ? 0.48 : 1) * (trophy ? 0.85 : 1),
    hpBonus: Math.floor(index / 12),
    incomeScale: (1 + index * 0.008) * (1 + 0.2 * Math.exp(-index / 22)),
    goldRate: treasure ? 0.57 : 0.035 + (index % 15) * 0.0015,
    diamonds: challenge || trophy ? 2 : id % 6 === 0 ? 2 : 1,
    bombRate: challenge ? 0.025 : treasure ? 0.085 : 0.05,
    rewardFactor: treasure ? 1.8 : challenge ? 1.12 : 1,
    bonus: Math.round((80 + id * 4) * (treasure ? 1.25 : challenge ? 1.15 : 1)),
    bossHp: trophy
      ? Math.ceil(
          180 *
            (1 + index * 0.025) *
            1.013 ** index *
            (1 + id * 0.008) *
            (challenge ? 1.75 : 1),
        )
      : 0,
    label: trophy
      ? challenge
        ? "БОСС · ИСПЫТАНИЕ"
        : "ХРАНИТЕЛЬ ГЛУБИН"
      : treasure
        ? challenge
          ? "ЗОЛОТОЕ ИСПЫТАНИЕ"
          : "ЗОЛОТАЯ ПЕРЕДЫШКА"
        : challenge
          ? "ИСПЫТАНИЕ"
          : "ЭКСПЕДИЦИЯ",
  };
});
