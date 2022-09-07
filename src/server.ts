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
  distance,
  scale,
} from "pocket-physics";
import {
  NetworkObject,
  gameStateUpdatesPerSecond,
  squareCanvasSizeInPixels,
  canvasTopLeftPoint,
  canvasTopRightPoint,
  canvasBottomRightPoint,
  canvasBottomLeftPoint,
  ballRadius,
  gameFramesPerSecond,
  ClientToServerEvents,
  ServerToClientEvents,
  canvasBackgroundPadding,
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
    value: 0,
    ...properties,
  } as NetworkObject;

  networkObjects.push(gameObject);

  return gameObject;
};

const getRandomNumberInsideCanvasSize = () =>
  canvasBackgroundPadding +
  ballRadius +
  Math.floor(Math.random() * (squareCanvasSizeInPixels - (canvasBackgroundPadding + ballRadius) * 2));

for (let value = 1; value <= 8; value++) {
  const randomPosition = { x: getRandomNumberInsideCanvasSize(), y: getRandomNumberInsideCanvasSize() };
  createNetworkObject({
    cpos: { x: randomPosition.x, y: randomPosition.y },
    ppos: { x: randomPosition.x, y: randomPosition.y },
    radius: ballRadius,
    value,
  });
}

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
  const randomPosition = { x: getRandomNumberInsideCanvasSize(), y: getRandomNumberInsideCanvasSize() };
  socket.data = createNetworkObject({
    cpos: { x: randomPosition.x, y: randomPosition.y },
    ppos: { x: randomPosition.x, y: randomPosition.y },
    radius: ballRadius,
    ownerSocketId: socket.id,
  });
  socket.data.nickname = `Player #${socket.data.id}`;
  socketsConnected.set(socket.id, socket);
  setupSocketListeners(socket);
};

const handleSocketDisconnected = (socket: ServerSocket) => {
  if (socket.data.id) {
    const id = socket.data.id;
    const networkObjectIndex = networkObjects.findIndex((target) => target.id === id);
    if (networkObjectIndex >= 0) networkObjects.splice(networkObjectIndex, 1);
    socketsConnected.forEach((targetSocket) => {
      targetSocket.emit("objectDeleted", id);
    });
  }
  broadcastChatMessage(`📢 ${socket.data.nickname} is gone!`);
  socketsConnected.delete(socket.id);
};

const broadcastChatMessage = (message: string) => {
  socketsConnected.forEach((socket) => {
    socket.emit("chat", message);
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
    const elasticityFactor = 20 * (distance(v2(x, y), socket.data.cpos) / squareCanvasSizeInPixels);
    scale(accelerationVector, accelerationVector, elasticityFactor);
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
      // socketsConnected.forEach((targetSocket) => {
      //   targetSocket.emit("score");
      // });
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

const randomHexColor = () => {
  const randomInteger = (max: number) => Math.floor(Math.random() * (max + 1));
  const randomRgbColor = () => [randomInteger(255), randomInteger(255), randomInteger(255)];
  const [r, g, b] = randomRgbColor();
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

subscribeToSocketDisconnected(handleSocketDisconnected);
subscribeToSocketConnected(handleSocketConnected);
setInterval(updatePhysics, physicsUpdateMillisecondsInterval);
setInterval(emitGameStateToConnectedSockets, gameStateUpdateMillisecondsInterval);
export default { io: publishSocketConnected };
