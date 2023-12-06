export const BrowserId = [
  "foxhound",
  "firefox",
  "firefox-nops",
  "brave",
  "brave-aggr",
] as const;

export type BrowserId = (typeof BrowserId)[number];

export const RunId = ["A", "B"] as const;

export type RunId = (typeof RunId)[number];

export const getBrowserSignature = (browserId: BrowserId): string => {
  switch (browserId) {
    case "foxhound":
      return "tf";
    case "firefox":
      return "ff";
    case "firefox-nops":
      return "fx";
    case "brave":
      return "br";
    case "brave-aggr":
      return "bx";
  }
};
