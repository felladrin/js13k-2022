import type { Integratable } from "pocket-physics";

export const gameStateUpdatesPerSecond = 4;

export const letterCircleRadius = 16;

export const squareCanvasSizeInPixels = 1024;

export type NetworkObject = Integratable & {
  id: number;
  radius: number;
  mass: number;
  width: number;
  height: number;
};

export type GameState = {
  networkObjects: NetworkObject[];
};

export interface PlayerProperties {
  nickname: string;
  currentFloor: number;
}
