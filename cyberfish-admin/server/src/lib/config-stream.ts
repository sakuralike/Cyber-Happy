import { EventEmitter } from "node:events";
import type { ConfigScope } from "./enums";

export interface ConfigPublishedEvent {
  scopes: ConfigScope[];
  version: number;
  at: string;
}

export const configEvents = new EventEmitter();
configEvents.setMaxListeners(0);

export function publishConfigEvent(payload: ConfigPublishedEvent): void {
  configEvents.emit("published", payload);
}
