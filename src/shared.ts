import type { Integratable } from "pocket-physics";

export const gameStateUpdatesPerSecond = 4;

export const gameFramesPerSecond = 60;

export const ballRadius = 14;

export const squareCanvasSizeInPixels = 680;

export type NetworkObject = Integratable & {
  id: number;
  radius: number;
  mass: number;
  value: number;
  label: string;
  color: string;
  ownerSocketId?: string;
};

export type GameState = {
  networkObjects: NetworkObject[];
};

export interface ServerToClientEvents {
  chat: (message: string) => void;
  gameState: (gameState: GameState) => void;
  objectDeleted: (id: number) => void;
  score: () => void;
}

export interface ClientToServerEvents {
  chat: (message: string) => void;
  nickname: (nickname: string) => void;
  pointerPressed: (coordinates: [x: number, y: number]) => void;
}
