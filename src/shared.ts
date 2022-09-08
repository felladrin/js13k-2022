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

export enum ServerToClientEventName {
  Message = "A",
  NetworkObjects = "B",
  Creation = "C",
  Deletion = "D",
  Score = "E",
  Positions = "F",
}

export enum ClientToServerEventName {
  Message = "A",
  Click = "B",
}

export interface ServerToClientEvents {
  [ServerToClientEventName.Message]: (message: string) => void;
  [ServerToClientEventName.NetworkObjects]: (networkObjects: NetworkObject[]) => void;
  [ServerToClientEventName.Creation]: (networkObject: NetworkObject) => void;
  [ServerToClientEventName.Deletion]: (id: number) => void;
  [ServerToClientEventName.Score]: () => void;
  [ServerToClientEventName.Positions]: (networkObjectsPositions: NetworkObjectsPositions) => void;
}

export interface ClientToServerEvents {
  [ClientToServerEventName.Message]: (message: string) => void;
  [ClientToServerEventName.Click]: (coordinates: [x: number, y: number]) => void;
}
