import type { Integratable } from "pocket-physics";

export const networkObjectsUpdatesPerSecond = 8;

export const ballRadius = 14;

export const squareCanvasSizeInPixels = 680;

export type NetworkObject = Integratable & {
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

export type NetworkObjectsPositions = [objectId: number, x: number, y: number][];

export type Scoreboard = [nick: string, score: number][];

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
  [ServerToClientEventName.Objects]: (objects: NetworkObject[]) => void;
  [ServerToClientEventName.Creation]: (object: NetworkObject) => void;
  [ServerToClientEventName.Deletion]: (id: number) => void;
  [ServerToClientEventName.Scored]: () => void;
  [ServerToClientEventName.Positions]: (objectsPositions: NetworkObjectsPositions) => void;
  [ServerToClientEventName.Scoreboard]: (scoreboard: Scoreboard) => void;
}

export interface ClientToServerEvents {
  [ClientToServerEventName.Message]: (message: string) => void;
  [ClientToServerEventName.Click]: (coordinates: [x: number, y: number]) => void;
}
