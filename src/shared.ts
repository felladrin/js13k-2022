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

export const canvasBackgroundPadding = 64;
export const canvasTopLeftPoint = { x: canvasBackgroundPadding, y: canvasBackgroundPadding };
export const canvasTopRightPoint = {
  x: squareCanvasSizeInPixels - canvasBackgroundPadding,
  y: canvasBackgroundPadding,
};
export const canvasBottomLeftPoint = {
  x: canvasBackgroundPadding,
  y: squareCanvasSizeInPixels - canvasBackgroundPadding,
};
export const canvasBottomRightPoint = {
  x: squareCanvasSizeInPixels - canvasBackgroundPadding,
  y: squareCanvasSizeInPixels - canvasBackgroundPadding,
};
