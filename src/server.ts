import type { Socket } from "socket.io";
import { createPubSub } from "create-pubsub";
import {
  accelerate,
  add,
  collideCircleCircle,
  collideCircleEdge,
  inertia,
  overlapCircleCircle,
  rewindToCollisionPoint,
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
} from "./shared";

const [publishSocketConnected, subscribeToSocketConnected] = createPubSub<Socket>();

const [publishSocketDisconnected, subscribeToSocketDisconnected] = createPubSub<Socket>();

const [setNextGameObjectId, , getNextGameObjectId] = createPubSub(0);

const socketsConnected = new Map<string, Socket>();

const gameStateUpdateMillisecondsInterval = 1000 / gameStateUpdatesPerSecond;

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

const handleSocketConnected = (socket: Socket) => {
  socket.data = createNetworkObject({ radius: letterCircleRadius });
  socketsConnected.set(socket.id, socket);
  setupSocketListeners(socket);
  console.log("Connected: " + socket.id);
};

const handleSocketDisconnected = (socket: Socket) => {
  socketsConnected.delete(socket.id);
  console.log("Disconnected: " + socket.id);
};

const setupSocketListeners = (socket: Socket) => {
  socket.on("disconnect", () => publishSocketDisconnected(socket));
  socket.on("arrowleft", () => {
    add(socket.data.acel, socket.data.acel, v2(-1));
  });
  socket.on("arrowright", () => {
    add(socket.data.acel, socket.data.acel, v2(1));
  });
  socket.on("arrowup", () => {
    add(socket.data.acel, socket.data.acel, v2(0, -1));
  });
  socket.on("arrowdown", () => {
    add(socket.data.acel, socket.data.acel, v2(0, 1));
  });
  socket.on("chat", (message: string) => {
    socketsConnected.forEach((targetSocket) => {
      targetSocket.emit("chat", `💬 ${targetSocket.id}: ${message}`);
    });
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
        -1,
        {
          cpos: pointB,
          ppos: pointB,
        },
        -1,
        true,
        0.9
      );
    }
  });
};

const updatePhysics = () => {
  networkObjects.forEach((networkObject) => {
    accelerate(networkObject, 1000 / gameFramesPerSecond);

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
setInterval(updatePhysics, 1000 / gameFramesPerSecond);
setInterval(emitGameStateToConnectedSockets, gameStateUpdateMillisecondsInterval);
export default { io: publishSocketConnected };
