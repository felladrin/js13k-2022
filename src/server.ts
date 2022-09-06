import type { Socket } from "socket.io";
import { createPubSub } from "create-pubsub";
import {
  accelerate,
  add,
  collideCircleCircle,
  collideCircleEdge,
  inertia,
  normalize,
  overlapCircleCircle,
  rewindToCollisionPoint,
  sub,
  v2,
  Vector2,
} from "pocket-physics";
import {
  NetworkObject,
  gameStateUpdatesPerSecond,
  squareCanvasSizeInPixels,
  canvasTopLeftPoint,
  canvasTopRightPoint,
  canvasBottomRightPoint,
  canvasBottomLeftPoint,
  letterCircleRadius,
  gameFramesPerSecond,
  ClientToServerEvents,
  ServerToClientEvents,
} from "./shared";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

type SocketData = NetworkObject & {
  nickname: string;
  currentFloor: number;
};

type ServerSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

const [publishSocketConnected, subscribeToSocketConnected] = createPubSub<ServerSocket>();

const [publishSocketDisconnected, subscribeToSocketDisconnected] = createPubSub<ServerSocket>();

const [setNextGameObjectId, , getNextGameObjectId] = createPubSub(0);

const socketsConnected = new Map<string, ServerSocket>();

const gameStateUpdateMillisecondsInterval = 1000 / gameStateUpdatesPerSecond;

const physicsUpdateMillisecondsInterval = 1000 / gameFramesPerSecond;

const massOfImmovableObjects = -1;

const networkObjects = [] as NetworkObject[];

const createNetworkObject = (properties?: Partial<NetworkObject>) => {
  const id = getNextGameObjectId();

  setNextGameObjectId(id + 1);

  const gameObject = {
    id,
    cpos: { x: squareCanvasSizeInPixels / 2, y: squareCanvasSizeInPixels / 2 },
    ppos: { x: squareCanvasSizeInPixels / 2, y: squareCanvasSizeInPixels / 2 },
    acel: { x: 0, y: 0 },
    radius: 1,
    mass: 1,
    width: 2,
    height: 2,
    ...properties,
  } as NetworkObject;

  networkObjects.push(gameObject);

  return gameObject;
};

const isColliding = (firstObject: NetworkObject, secondObject: NetworkObject) => {
  return overlapCircleCircle(
    firstObject.cpos.x,
    firstObject.cpos.y,
    firstObject.radius,
    secondObject.cpos.x,
    secondObject.cpos.y,
    secondObject.radius
  );
};

const handleCollision = (firstObject: NetworkObject, secondObject: NetworkObject) => {
  return collideCircleCircle(
    firstObject,
    firstObject.radius,
    firstObject.mass,
    secondObject,
    secondObject.radius,
    secondObject.mass,
    true,
    0.9
  );
};

const handleSocketConnected = (socket: ServerSocket) => {
  socket.data = createNetworkObject({ radius: letterCircleRadius, ownerSocketId: socket.id });
  socket.data.nickname = `Subject #${socket.data.id}`;
  socketsConnected.set(socket.id, socket);
  setupSocketListeners(socket);
  console.log("Connected: " + socket.id);
};

const handleSocketDisconnected = (socket: ServerSocket) => {
  socketsConnected.delete(socket.id);
  broadcastChatMessage(`📢 ${socket.data.nickname} is gone!`);
  console.log("Disconnected: " + socket.id);
};

const broadcastChatMessage = (message: string) => {
  socketsConnected.forEach((targetSocket) => {
    targetSocket.emit("chat", message);
  });
};

const setupSocketListeners = (socket: ServerSocket) => {
  socket.on("disconnect", () => publishSocketDisconnected(socket));
  socket.on("chat", (message: string) => {
    broadcastChatMessage(`💬 ${socket.data.nickname}: ${message}`);
  });
  socket.on("nickname", (nickname) => {
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length) socket.data.nickname = trimmedNickname;
    broadcastChatMessage(`📢 ${socket.data.nickname} joined!`);
  });
  socket.on("pointerPressed", ([x, y]: [x: number, y: number]) => {
    if (!socket.data.cpos || !socket.data.acel) return;
    const accelerationVector = v2();
    sub(accelerationVector, v2(x, y), socket.data.cpos);
    normalize(accelerationVector, accelerationVector);
    add(socket.data.acel, socket.data.acel, accelerationVector);
  });
};

const checkCollisionWithCanvasEdges = (networkObject: NetworkObject) => {
  const pointsFromCanvasEdges = [
    [canvasTopLeftPoint, canvasTopRightPoint],
    [canvasTopRightPoint, canvasBottomRightPoint],
    [canvasBottomRightPoint, canvasBottomLeftPoint],
    [canvasBottomLeftPoint, canvasTopLeftPoint],
  ] as [pointA: Vector2, pointB: Vector2][];

  pointsFromCanvasEdges.forEach(([pointA, pointB]) => {
    if (rewindToCollisionPoint(networkObject, networkObject.radius, pointA, pointB)) {
      collideCircleEdge(
        networkObject,
        networkObject.radius,
        networkObject.mass,
        {
          cpos: pointA,
          ppos: pointA,
        },
        massOfImmovableObjects,
        {
          cpos: pointB,
          ppos: pointB,
        },
        massOfImmovableObjects,
        true,
        0.9
      );
    }
  });
};

const updatePhysics = () => {
  networkObjects.forEach((networkObject) => {
    accelerate(networkObject, physicsUpdateMillisecondsInterval);

    networkObjects
      .filter(
        (otherNetworkObject) => networkObject !== otherNetworkObject && isColliding(networkObject, otherNetworkObject)
      )
      .forEach((otherNetworkObject) => {
        handleCollision(networkObject, otherNetworkObject);
      });

    checkCollisionWithCanvasEdges(networkObject);

    inertia(networkObject);
  });
};

const emitGameStateToConnectedSockets = () => {
  socketsConnected.forEach((socket) => {
    socket.emit("gameState", { networkObjects });
  });
};

subscribeToSocketDisconnected(handleSocketDisconnected);
subscribeToSocketConnected(handleSocketConnected);
setInterval(updatePhysics, physicsUpdateMillisecondsInterval);
setInterval(emitGameStateToConnectedSockets, gameStateUpdateMillisecondsInterval);
export default { io: publishSocketConnected };
