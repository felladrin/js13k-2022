import type { Socket } from "socket.io";
import type { DefaultEventsMap } from "socket.io/dist/typed-events";
import { createPubSub } from "create-pubsub";
import MainLoop from "mainloop.js";
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
  copy,
} from "pocket-physics";
import {
  NetworkObject,
  networkObjectsUpdatesPerSecond,
  squareCanvasSizeInPixels,
  ballRadius,
  ClientToServerEvents,
  ServerToClientEvents,
  ServerToClientEventName,
  ClientToServerEventName,
  NetworkObjectsPositions,
} from "./shared";

type SocketData = NetworkObject & {
  nickname: string;
  score: number;
};

type ServerSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

const [publishSocketConnected, subscribeToSocketConnected] = createPubSub<ServerSocket>();

const [publishSocketDisconnected, subscribeToSocketDisconnected] = createPubSub<ServerSocket>();

const [setNextGameObjectId, , getNextGameObjectId] = createPubSub(0);

const [
  publishTimePassedSinceLastStateUpdateEmitted,
  subscribeToTimePassedSinceLastStateUpdateEmitted,
  getTimePassedSinceLastStateUpdateEmitted,
] = createPubSub(0);

const socketsConnected = new Map<string, ServerSocket>();

const gameStateUpdateMillisecondsInterval = 1000 / networkObjectsUpdatesPerSecond;

const massOfImmovableObjects = -1;

const networkObjects = [] as NetworkObject[];

const ballColors = ["#fff", "#ffff00", "#0000ff", "#ff0000", "#aa00aa", "#ffaa00", "#1f952f", "#550000", "#1a191e"];

const cornerPocketSize = 100;

const tablePadding = 64;

const maximumNicknameLength = 21;

const tableLeftRailPoints = [
  v2(tablePadding, cornerPocketSize),
  v2(tablePadding, squareCanvasSizeInPixels - cornerPocketSize),
] as [Vector2, Vector2];

const tableRightRailPoints = [
  v2(squareCanvasSizeInPixels - tablePadding, cornerPocketSize),
  v2(squareCanvasSizeInPixels - tablePadding, squareCanvasSizeInPixels - cornerPocketSize),
] as [Vector2, Vector2];

const tableTopRailPoints = [
  v2(cornerPocketSize, tablePadding),
  v2(squareCanvasSizeInPixels - cornerPocketSize, tablePadding),
] as [Vector2, Vector2];

const tableBottomRailPoints = [
  v2(cornerPocketSize, squareCanvasSizeInPixels - tablePadding),
  v2(squareCanvasSizeInPixels - cornerPocketSize, squareCanvasSizeInPixels - tablePadding),
] as [Vector2, Vector2];

const tableRails = [tableLeftRailPoints, tableRightRailPoints, tableTopRailPoints, tableBottomRailPoints];

const scoreLineDistanceFromCorner = 140;

const scoreLines = [
  [v2(0, scoreLineDistanceFromCorner), v2(scoreLineDistanceFromCorner, 0)],
  [
    v2(squareCanvasSizeInPixels - scoreLineDistanceFromCorner, 0),
    v2(squareCanvasSizeInPixels, scoreLineDistanceFromCorner),
  ],
  [
    v2(0, squareCanvasSizeInPixels - scoreLineDistanceFromCorner),
    v2(scoreLineDistanceFromCorner, squareCanvasSizeInPixels),
  ],
  [
    v2(squareCanvasSizeInPixels, squareCanvasSizeInPixels - scoreLineDistanceFromCorner),
    v2(squareCanvasSizeInPixels - scoreLineDistanceFromCorner, squareCanvasSizeInPixels),
  ],
] as [Vector2, Vector2][];

const getRandomElementFrom = (object: any[] | string) => object[Math.floor(Math.random() * object.length)];

const getRandomSmile = () => `${getRandomElementFrom(":=")}${getRandomElementFrom("POD)]")}`;

const createNetworkObject = (properties?: Partial<NetworkObject>) => {
  const id = getNextGameObjectId();

  setNextGameObjectId(id + 1);

  const gameObject = {
    id,
    cpos: v2(),
    ppos: v2(),
    acel: v2(),
    radius: 1,
    mass: 1,
    value: 0,
    label: getRandomSmile(),
    ...properties,
  } as NetworkObject;

  networkObjects.push(gameObject);

  socketsConnected.forEach((socket) => {
    socket.emit(ServerToClientEventName.Creation, gameObject);
  });

  return gameObject;
};

const getRandomNumberInsideCanvasSize = () =>
  tablePadding + ballRadius + Math.floor(Math.random() * (squareCanvasSizeInPixels - (tablePadding + ballRadius) * 2));

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
    cpos: copy(v2(), randomPosition),
    ppos: copy(v2(), randomPosition),
    radius: ballRadius,
    ownerSocketId: socket.id,
    color: getRandomHexColor(),
  });
  socket.data.nickname = `Player #${socket.data.id}`;
  socket.emit(
    ServerToClientEventName.Message,
    `📢 Welcome, ${socket.data.nickname}!\nTo change your nickname, type '/nick <name>' on the text field below.`
  );
  socket.emit(ServerToClientEventName.NetworkObjects, networkObjects);
  broadcastChatMessage(`📢 ${socket.data.nickname} joined!`);
  socketsConnected.set(socket.id, socket);
  setupSocketListeners(socket);
};

const handleSocketDisconnected = (socket: ServerSocket) => {
  if (socket.data.id) {
    deleteNetworkObject(socket.data as NetworkObject);
  }
  broadcastChatMessage(`📢 ${socket.data.nickname} left.`);
  socketsConnected.delete(socket.id);
};

const broadcastChatMessage = (message: string) => {
  socketsConnected.forEach((socket) => {
    socket.emit(ServerToClientEventName.Message, message);
  });
};

const setupSocketListeners = (socket: ServerSocket) => {
  socket.on("disconnect", () => publishSocketDisconnected(socket));
  socket.on(ClientToServerEventName.Message, (message: string) => {
    if (message.startsWith("/nick ")) {
      const trimmedNickname = message.replace("/nick ", "").trim().substring(0, maximumNicknameLength);
      if (trimmedNickname.length) {
        broadcastChatMessage(`📢 ${socket.data.nickname} changed nickname to ${trimmedNickname}!`);
        socket.data.nickname = trimmedNickname;
      }
    } else {
      broadcastChatMessage(`💬 ${socket.data.nickname}: ${message}`);
    }
  });
  socket.on(ClientToServerEventName.Click, ([x, y]: [x: number, y: number]) => {
    if (!socket.data.cpos || !socket.data.acel) return;
    const accelerationVector = v2();
    sub(accelerationVector, v2(x, y), socket.data.cpos);
    normalize(accelerationVector, accelerationVector);
    const elasticityFactor = 20 * (distance(v2(x, y), socket.data.cpos) / squareCanvasSizeInPixels);
    scale(accelerationVector, accelerationVector, elasticityFactor);
    add(socket.data.acel, socket.data.acel, accelerationVector);
  });
};

const checkCollisionWithTableEdges = (networkObject: NetworkObject) => {
  tableRails.forEach(([pointA, pointB]) => {
    if (rewindToCollisionPoint(networkObject, networkObject.radius, pointA, pointB))
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
  });
};

const deleteNetworkObject = (networkObject: NetworkObject) => {
  const networkObjectIndex = networkObjects.findIndex((target) => target.id === networkObject.id);
  if (networkObjectIndex >= 0) networkObjects.splice(networkObjectIndex, 1);
  socketsConnected.forEach((targetSocket) => {
    targetSocket.emit(ServerToClientEventName.Deletion, networkObject.id);
  });
};

const checkCollisionWithScoreLines = (networkObject: NetworkObject) => {
  scoreLines.forEach(([pointA, pointB]) => {
    if (rewindToCollisionPoint(networkObject, networkObject.radius, pointA, pointB)) {
      deleteNetworkObject(networkObject);
      socketsConnected.forEach((socket) => {
        socket.emit(ServerToClientEventName.Score);
      });
    }
  });
};

const emitGameStateToConnectedSockets = () => {
  const positions = networkObjects.reduce<NetworkObjectsPositions>((networkObjectsPositions, networkObject) => {
    networkObjectsPositions.push([
      networkObject.id,
      Math.trunc(networkObject.cpos.x),
      Math.trunc(networkObject.cpos.y),
    ]);
    return networkObjectsPositions;
  }, []);

  socketsConnected.forEach((socket) => {
    socket.emit(ServerToClientEventName.Positions, positions);
  });
};

const handleUpdateOnTimePassedSinceLastStateUpdateEmitted = (deltaTime: number) => {
  if (deltaTime > gameStateUpdateMillisecondsInterval) {
    emitGameStateToConnectedSockets();
    publishTimePassedSinceLastStateUpdateEmitted(deltaTime - gameStateUpdateMillisecondsInterval);
  }
};

const updatePhysics = (deltaTime: number) => {
  networkObjects.forEach((networkObject) => {
    accelerate(networkObject, deltaTime);

    networkObjects
      .filter(
        (otherNetworkObject) => networkObject !== otherNetworkObject && isColliding(networkObject, otherNetworkObject)
      )
      .forEach((otherNetworkObject) => handleCollision(networkObject, otherNetworkObject));

    checkCollisionWithTableEdges(networkObject);

    checkCollisionWithScoreLines(networkObject);

    inertia(networkObject);
  });
};

const getRandomHexColor = () => {
  const randomInteger = (max: number) => Math.floor(Math.random() * (max + 1));
  const randomRgbColor = () => [randomInteger(255), randomInteger(255), randomInteger(255)];
  const [r, g, b] = randomRgbColor();
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

const handleMainLoopUpdate = (deltaTime: number) => {
  updatePhysics(deltaTime);
  publishTimePassedSinceLastStateUpdateEmitted(getTimePassedSinceLastStateUpdateEmitted() + deltaTime);
};

for (let i = 0; i < 2; i++) {
  for (let value = 1; value <= 8; value++) {
    const randomPosition = { x: getRandomNumberInsideCanvasSize(), y: getRandomNumberInsideCanvasSize() };
    createNetworkObject({
      cpos: copy(v2(), randomPosition),
      ppos: copy(v2(), randomPosition),
      radius: ballRadius,
      value,
      label: `${value}`,
      color: ballColors[value],
    });
  }
}

subscribeToTimePassedSinceLastStateUpdateEmitted(handleUpdateOnTimePassedSinceLastStateUpdateEmitted);
subscribeToSocketDisconnected(handleSocketDisconnected);
subscribeToSocketConnected(handleSocketConnected);

MainLoop.setUpdate(handleMainLoopUpdate).start();

export default { io: publishSocketConnected };
