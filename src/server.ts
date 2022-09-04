import type { Socket } from "socket.io";
import { createPubSub } from "create-pubsub";
import {
  accelerate,
  collideCircleCircle,
  collideCircleEdge,
  inertia,
  overlapCircleCircle,
  rewindToCollisionPoint,
  Vector2,
} from "pocket-physics";
import { NetworkObject, gameStateUpdatesPerSecond, squareCanvasSizeInPixels } from "./shared";

const [publishSocketConnected, subscribeToSocketConnected] = createPubSub<Socket>();

const [publishSocketDisconnected, subscribeToSocketDisconnected] = createPubSub<Socket>();

const [setNextGameObjectId, , getNextGameObjectId] = createPubSub(0);

const socketsConnected = new Map<string, Socket>();

const gameStateUpdateMillisecondsInterval = 1000 / gameStateUpdatesPerSecond;

const networkObjects = [] as NetworkObject[];

const topLeftPoint = { x: 0, y: 0 } as Vector2;
const topRightPoint = { x: squareCanvasSizeInPixels, y: 0 } as Vector2;
const bottomLeftPoint = { x: 0, y: squareCanvasSizeInPixels } as Vector2;
const bottomRightPoint = { x: squareCanvasSizeInPixels, y: squareCanvasSizeInPixels } as Vector2;

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
    false,
    0.9
  );
};

const handleSocketConnected = (socket: Socket) => {
  socket.data = createNetworkObject();
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
    socket.data.acel.x += -0.1;
  });
  socket.on("arrowright", () => {
    socket.data.acel.x += 0.1;
  });
  socket.on("arrowup", () => {
    socket.data.acel.y += -0.1;
  });
  socket.on("arrowdown", () => {
    socket.data.acel.y += 0.1;
  });
  socket.on("chat", (message: string) => {
    socketsConnected.forEach((targetSocket) => {
      targetSocket.emit("chat", `💬 ${targetSocket.id}: ${message}`);
    });
  });
};

const processServerTick = () => {
  if (socketsConnected.size == 0) return;

  networkObjects.forEach((networkObject) => {
    accelerate(networkObject, gameStateUpdateMillisecondsInterval);

    networkObjects
      .filter(
        (otherNetworkObject) => networkObject !== otherNetworkObject && isColliding(networkObject, otherNetworkObject)
      )
      .forEach((otherNetworkObject) => {
        handleCollision(networkObject, otherNetworkObject);
      });

    if (rewindToCollisionPoint(networkObject, networkObject.radius, topLeftPoint, topRightPoint)) {
      collideCircleEdge(
        networkObject,
        networkObject.radius,
        networkObject.mass,
        {
          cpos: topLeftPoint,
          ppos: topLeftPoint,
        },
        -1,
        {
          cpos: topRightPoint,
          ppos: topRightPoint,
        },
        -1,
        true,
        0.9
      );
    }

    if (rewindToCollisionPoint(networkObject, networkObject.radius, topRightPoint, bottomRightPoint)) {
      collideCircleEdge(
        networkObject,
        networkObject.radius,
        networkObject.mass,
        {
          cpos: topRightPoint,
          ppos: topRightPoint,
        },
        -1,
        {
          cpos: bottomRightPoint,
          ppos: bottomRightPoint,
        },
        -1,
        true,
        0.9
      );
    }

    if (rewindToCollisionPoint(networkObject, networkObject.radius, bottomRightPoint, bottomLeftPoint)) {
      collideCircleEdge(
        networkObject,
        networkObject.radius,
        networkObject.mass,
        {
          cpos: bottomRightPoint,
          ppos: bottomRightPoint,
        },
        -1,
        {
          cpos: bottomLeftPoint,
          ppos: bottomLeftPoint,
        },
        -1,
        true,
        0.9
      );
    }

    if (rewindToCollisionPoint(networkObject, networkObject.radius, bottomLeftPoint, topLeftPoint)) {
      collideCircleEdge(
        networkObject,
        networkObject.radius,
        networkObject.mass,
        {
          cpos: bottomLeftPoint,
          ppos: bottomLeftPoint,
        },
        -1,
        {
          cpos: topLeftPoint,
          ppos: topLeftPoint,
        },
        -1,
        true,
        0.9
      );
    }

    inertia(networkObject);
  });

  socketsConnected.forEach((socket) => {
    socket.emit("gameState", { networkObjects });
  });
};

subscribeToSocketDisconnected(handleSocketDisconnected);
subscribeToSocketConnected(handleSocketConnected);
setInterval(processServerTick, gameStateUpdateMillisecondsInterval);
export default { io: publishSocketConnected };
