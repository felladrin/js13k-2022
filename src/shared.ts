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

export enum ServerToClientEventName {
  GameState = "A",
  Message = "B",
  Deletion = "C",
  Score = "D",
}

export enum ClientToServerEventName {
  Message = "A",
  Nickname = "B",
  Click = "C",
}

export interface ServerToClientEvents {
  [ServerToClientEventName.Message]: (message: string) => void;
  [ServerToClientEventName.GameState]: (gameState: GameState) => void;
  [ServerToClientEventName.Deletion]: (id: number) => void;
  [ServerToClientEventName.Score]: () => void;
}

export interface ClientToServerEvents {
  [ClientToServerEventName.Message]: (message: string) => void;
  [ClientToServerEventName.Nickname]: (nickname: string) => void;
  [ClientToServerEventName.Click]: (coordinates: [x: number, y: number]) => void;
}
