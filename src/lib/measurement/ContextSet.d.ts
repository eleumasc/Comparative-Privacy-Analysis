import { Cookie, Frame, Request, StorageItem } from "../model";

export interface ContextFrame {
  frame: Frame;
  requests: Request[];
}

export interface Context {
  origin: string;
  cookies: Cookie[];
  storageItems: StorageItem[];
  frames: ContextFrame[];
}

export interface ContextSet {
  firstPartyContext: Context;
  thirdPartyContexts: Context[];
}
