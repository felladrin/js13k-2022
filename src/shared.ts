import type { Integratable } from "pocket-physics";

export const gameStateUpdatesPerSecond = 4;

export const gameFramesPerSecond = 60;

export const letterCircleRadius = 16;

export const squareCanvasSizeInPixels = 1024;

export type NetworkObject = Integratable & {
  id: number;
  radius: number;
  mass: number;
  width: number;
  height: number;
  ownerSocketId: string;
};

export type GameState = {
  networkObjects: NetworkObject[];
};

export interface ServerToClientEvents {
  chat: (message: string) => void;
  gameState: (gameState: GameState) => void;
}

export interface ClientToServerEvents {
  chat: (message: string) => void;
  nickname: (nickname: string) => void;
  pointerPressed: (coordinates: [x: number, y: number]) => void;
}

export const canvasTopLeftPoint = { x: 0, y: 0 };
export const canvasTopRightPoint = { x: squareCanvasSizeInPixels, y: 0 };
export const canvasBottomLeftPoint = { x: 0, y: squareCanvasSizeInPixels };
export const canvasBottomRightPoint = { x: squareCanvasSizeInPixels, y: squareCanvasSizeInPixels };
