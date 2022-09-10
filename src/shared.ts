import type { Integratable } from "pocket-physics";

export const networkObjectsUpdatesPerSecond = 8;

export const ballRadius = 14;

export const squareCanvasSizeInPixels = 680;

export type Ball = Integratable & {
  id: number;
  radius: number;
  mass: number;
  value: number;
  label: string;
  color: string;
  lastTouchedTimestamp: number;
  lastTouchedBySocketId?: string;
  ownerSocketId?: string;
};

export type BallsPositions = [objectId: number, x: number, y: number][];

export type Scoreboard = [nick: string, score: number, tableId: number][];

export enum ServerToClientEventName {
  Message = "A",
  Objects = "B",
  Creation = "C",
  Deletion = "D",
  Scored = "E",
  Positions = "F",
  Scoreboard = "G",
}

export enum ClientToServerEventName {
  Message = "A",
  Click = "B",
}

export interface ServerToClientEvents {
  [ServerToClientEventName.Message]: (message: string) => void;
  [ServerToClientEventName.Objects]: (objects: Ball[]) => void;
  [ServerToClientEventName.Creation]: (object: Ball) => void;
  [ServerToClientEventName.Deletion]: (id: number) => void;
  [ServerToClientEventName.Scored]: (value: number, positionX: number, positionY: number) => void;
  [ServerToClientEventName.Positions]: (ballsPositions: BallsPositions) => void;
  [ServerToClientEventName.Scoreboard]: (overallScoreboard: Scoreboard, tableScoreboard: Scoreboard) => void;
}

export interface ClientToServerEvents {
  [ClientToServerEventName.Message]: (message: string) => void;
  [ClientToServerEventName.Click]: (positionX: number, positionY: number) => void;
}
