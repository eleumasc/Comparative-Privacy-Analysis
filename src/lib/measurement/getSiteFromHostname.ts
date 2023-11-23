import psl from "psl";

export const getSiteFromHostname = (hostname: string): string => {
  const site = psl.get(hostname);
  if (site !== null) {
    return site;
  } else {
    throw new Error(`Invalid hostname: ${hostname}`);
  }
};
