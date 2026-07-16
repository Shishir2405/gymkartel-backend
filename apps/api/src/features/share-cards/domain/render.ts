import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export const TOKENS = {
  bg: "#141416",
  surface: "#1C1C1F",
  accent: "#C0392B",
  text: "#F5F0EB",
  muted: "rgba(245, 240, 235, 0.52)",
  hairline: "rgba(245, 240, 235, 0.10)",
} as const;

export interface ShareCardData {
  readonly gymName: string;
  readonly dayCount: number;
  readonly streakWeeks: number;
  readonly rankLabel: string;
  readonly date: string;
}

interface Node {
  readonly type: string;
  readonly props: {
    readonly style?: Readonly<Record<string, string | number>>;
    readonly children?: readonly (Node | string)[] | Node | string;
  };
}

const el = (
  type: string,
  style: Readonly<Record<string, string | number>>,
  children?: readonly (Node | string)[] | Node | string,
): Node => ({ type, props: { style, ...(children === undefined ? {} : { children }) } });

interface LoadedFont {
  readonly name: string;
  readonly data: Buffer;
  readonly weight: 400 | 600 | 700;
  readonly style: "normal";
}

let fontCache: readonly LoadedFont[] | null = null;

const loadFonts = (): readonly LoadedFont[] => {
  if (fontCache) return fontCache;
  const font = (file: string): Buffer =>
    readFileSync(fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url)));
  fontCache = [
    { name: "Barlow Condensed", data: font("BarlowCondensed-Bold.ttf"), weight: 700, style: "normal" },
    { name: "Barlow Condensed", data: font("BarlowCondensed-SemiBold.ttf"), weight: 600, style: "normal" },
    { name: "Inter", data: font("Inter-Regular.woff"), weight: 400, style: "normal" },
    { name: "Inter", data: font("Inter-SemiBold.woff"), weight: 600, style: "normal" },
  ];
  return fontCache;
};

const buildCard = (data: ShareCardData): Node =>
  el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: `${CARD_WIDTH}px`,
      height: `${CARD_HEIGHT}px`,
      backgroundColor: TOKENS.bg,
      padding: "72px",
      fontFamily: "Inter",
      color: TOKENS.text,
    },
    [
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          backgroundColor: TOKENS.surface,
          borderRadius: "48px",
          border: `2px solid ${TOKENS.hairline}`,
          padding: "88px 80px",
        },
        [
          el(
            "div",
            { display: "flex", flexDirection: "column" },
            [
              el(
                "div",
                {
                  display: "flex",
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: "44px",
                  letterSpacing: "6px",
                  textTransform: "uppercase",
                  color: TOKENS.text,
                },
                data.gymName.toUpperCase(),
              ),
              el(
                "div",
                {
                  display: "flex",
                  alignSelf: "flex-start",
                  marginTop: "28px",
                  backgroundColor: TOKENS.accent,
                  color: TOKENS.text,
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: "34px",
                  letterSpacing: "4px",
                  textTransform: "uppercase",
                  padding: "16px 32px",
                  borderRadius: "999px",
                },
                data.rankLabel.toUpperCase(),
              ),
            ],
          ),
          el(
            "div",
            {
              display: "flex",
              flexDirection: "column",
              flexGrow: 1,
              justifyContent: "center",
            },
            [
              el(
                "div",
                {
                  display: "flex",
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: "56px",
                  letterSpacing: "18px",
                  color: TOKENS.muted,
                  textTransform: "uppercase",
                },
                "Day",
              ),
              el(
                "div",
                {
                  display: "flex",
                  fontFamily: "Barlow Condensed",
                  fontWeight: 700,
                  fontSize: "620px",
                  lineHeight: 0.86,
                  color: TOKENS.accent,
                },
                String(data.dayCount),
              ),
            ],
          ),
          el(
            "div",
            {
              display: "flex",
              flexDirection: "column",
              borderTop: `2px solid ${TOKENS.hairline}`,
              paddingTop: "44px",
            },
            [
              el(
                "div",
                {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                },
                [
                  el(
                    "div",
                    { display: "flex", flexDirection: "column" },
                    [
                      el(
                        "div",
                        {
                          display: "flex",
                          fontFamily: "Barlow Condensed",
                          fontWeight: 700,
                          fontSize: "150px",
                          lineHeight: 1,
                          color: TOKENS.text,
                        },
                        `${data.streakWeeks}`,
                      ),
                      el(
                        "div",
                        {
                          display: "flex",
                          fontFamily: "Inter",
                          fontWeight: 600,
                          fontSize: "32px",
                          letterSpacing: "5px",
                          textTransform: "uppercase",
                          color: TOKENS.muted,
                        },
                        "Week Streak",
                      ),
                    ],
                  ),
                  el(
                    "div",
                    {
                      display: "flex",
                      fontFamily: "Inter",
                      fontWeight: 600,
                      fontSize: "36px",
                      letterSpacing: "5px",
                      color: TOKENS.muted,
                    },
                    data.date.toUpperCase(),
                  ),
                ],
              ),
              el(
                "div",
                {
                  display: "flex",
                  marginTop: "48px",
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: "40px",
                  letterSpacing: "12px",
                  textTransform: "uppercase",
                  color: TOKENS.text,
                },
                "Gym Kartel",
              ),
            ],
          ),
        ],
      ),
    ],
  );

export const renderShareCard = async (data: ShareCardData): Promise<Buffer> => {
  const fonts = loadFonts();
  const svg = await satori(buildCard(data) as unknown as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_WIDTH },
    background: TOKENS.bg,
  })
    .render()
    .asPng();
  return png;
};
