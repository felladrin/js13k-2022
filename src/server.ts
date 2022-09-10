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
} from "pocket-physics";
import {
  Ball,
  networkObjectsUpdatesPerSecond,
  squareCanvasSizeInPixels,
  ballRadius,
  ClientToServerEvents,
  ServerToClientEvents,
  ServerToClientEventName,
  ClientToServerEventName,
  BallsPositions,
  Scoreboard,
} from "./shared";

type SocketData = {
  ball: Ball;
  nickname: string;
  score: number;
  table: Table;
};

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

type Table = {
  id: number;
  sockets: Map<string, GameSocket>;
  balls: Map<number, Ball>;
};

let uniqueIdCounter = 1;

const getUniqueId = () => {
  const id = uniqueIdCounter;
  id < Number.MAX_SAFE_INTEGER ? uniqueIdCounter++ : 1;
  return id;
};

const [
  publishTimePassedSinceLastStateUpdateEmitted,
  subscribeToTimePassedSinceLastStateUpdateEmitted,
  getTimePassedSinceLastStateUpdateEmitted,
] = createPubSub(0);

const [
  publishTimePassedSinceLastScoreboardUpdate,
  subscribeToTimePassedSinceLastScoreboardUpdate,
  getTimePassedSinceLastScoreboardUpdate,
] = createPubSub(0);

const maxSocketsPerTable = 4;

const scoreboardUpdateMillisecondsInterval = 1000;

const objectsPositionsUpdateMillisecondsInterval = 1000 / networkObjectsUpdatesPerSecond;

const massOfImmovableObjects = -1;

const tables = new Map<number, Table>();

const ballColors = ["#fff", "#ffff00", "#0000ff", "#ff0000", "#aa00aa", "#ffaa00", "#1f952f", "#550000", "#1a191e"];

const collisionDamping = 0.9;

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

const getRandomTextualSmile = () => `${getRandomElementFrom(":=")}${getRandomElementFrom("POD)]")}`;

const addBallToTable = (table: Table, properties?: Partial<Ball>) => {
  const ball = {
    id: getUniqueId(),
    cpos: v2(),
    ppos: v2(),
    acel: v2(),
    radius: 1,
    mass: 1,
    value: 0,
    label: getRandomTextualSmile(),
    lastTouchedTimestamp: Date.now(),
    ...properties,
  } as Ball;

  table.balls.set(ball.id, ball);

  table.sockets.forEach((socket) => socket.emit(ServerToClientEventName.Creation, ball));

  return ball;
};

const getRandomPositionForBallOnTable = () =>
  tablePadding + ballRadius + Math.floor(Math.random() * (squareCanvasSizeInPixels - (tablePadding + ballRadius) * 2));

const isColliding = (firstObject: Ball, secondObject: Ball) =>
  overlapCircleCircle(
    firstObject.cpos.x,
    firstObject.cpos.y,
    firstObject.radius,
    secondObject.cpos.x,
    secondObject.cpos.y,
    secondObject.radius
  );

const handleCollision = (firstObject: Ball, secondObject: Ball) => {
  if (firstObject.ownerSocketId || secondObject.ownerSocketId) {
    if (firstObject.ownerSocketId) secondObject.lastTouchedBySocketId = firstObject.ownerSocketId;

    if (secondObject.ownerSocketId) firstObject.lastTouchedBySocketId = secondObject.ownerSocketId;
  } else {
    if (firstObject.lastTouchedTimestamp > secondObject.lastTouchedTimestamp) {
      secondObject.lastTouchedBySocketId = firstObject.lastTouchedBySocketId;
    } else {
      firstObject.lastTouchedBySocketId = secondObject.lastTouchedBySocketId;
    }
  }

  firstObject.lastTouchedTimestamp = secondObject.lastTouchedTimestamp = Date.now();

  collideCircleCircle(
    firstObject,
    firstObject.radius,
    firstObject.mass,
    secondObject,
    secondObject.radius,
    secondObject.mass,
    true,
    collisionDamping
  );
};

const createBallForSocket = (socket: GameSocket) => {
  if (!socket.data.table) return;

  const x = getRandomPositionForBallOnTable();
  const y = getRandomPositionForBallOnTable();

  const ball = addBallToTable(socket.data.table, {
    cpos: { x, y },
    ppos: { x, y },
    radius: ballRadius,
    ownerSocketId: socket.id,
    color: getRandomHexColor(),
    value: 9,
  });

  socket.data.ball = ball;
};

const deleteBallFromSocket = (socket: GameSocket) => {
  if (!socket.data.table || !socket.data.ball) return;

  deleteBallFromTable(socket.data.ball, socket.data.table);

  socket.data.ball = undefined;
};

const getNumberOfNotOwnedBallsOnTable = (table: Table) =>
  Array.from(table.balls.values()).filter((ball) => !ball.ownerSocketId).length;

const handleSocketConnected = (socket: GameSocket) => {
  socket.data.nickname = `Player${getUniqueId()}`;
  socket.data.score = 0;

  socket.emit(
    ServerToClientEventName.Message,
    `📢 Welcome, ${socket.data.nickname}!\nTo change your nickname, type '/nick <name>' on the text field below.`
  );

  const table =
    Array.from(tables.values()).find((currentTable) => currentTable.sockets.size < maxSocketsPerTable) ?? createTable();

  addSocketToTable(socket, table);

  setupSocketListeners(socket);
};

const handleSocketDisconnected = (socket: GameSocket) => {
  if (!socket.data.table) return;
  removeSocketFromTable(socket, socket.data.table);
};

const broadcastChatMessageToTable = (message: string, table: Table) =>
  table.sockets.forEach((socket) => socket.emit(ServerToClientEventName.Message, message));

const broadcastChatMessageToAllTables = (message: string) =>
  tables.forEach((table) => broadcastChatMessageToTable(message, table));

const accelerateBallFromSocket = (x: number, y: number, socket: GameSocket) => {
  if (!socket.data.ball) return;
  const accelerationVector = v2();
  sub(accelerationVector, v2(x, y), socket.data.ball.cpos);
  normalize(accelerationVector, accelerationVector);
  const elasticityFactor = 20 * (distance(v2(x, y), socket.data.ball.cpos) / squareCanvasSizeInPixels);
  scale(accelerationVector, accelerationVector, elasticityFactor);
  add(socket.data.ball.acel, socket.data.ball.acel, accelerationVector);
};

const handleMessageReceivedFromSocket = (message: string, socket: GameSocket) => {
  if (message.startsWith("/nick ")) {
    const trimmedNickname = message.replace("/nick ", "").trim().substring(0, maximumNicknameLength);

    if (trimmedNickname.length) {
      broadcastChatMessageToAllTables(`📢 ${socket.data.nickname} is now known as ${trimmedNickname}!`);
      socket.data.nickname = trimmedNickname;
    }
  } else {
    broadcastChatMessageToAllTables(`💬 ${socket.data.nickname}: ${message}`);
  }
};

const setupSocketListeners = (socket: GameSocket) => {
  socket.on("disconnect", () => handleSocketDisconnected(socket));
  socket.on(ClientToServerEventName.Message, (message) => handleMessageReceivedFromSocket(message, socket));
  socket.on(ClientToServerEventName.Click, (x, y) => accelerateBallFromSocket(x, y, socket));
};

const checkCollisionWithTableEdges = (networkObject: Ball) => {
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
        collisionDamping
      );
  });
};

const deleteBallFromTable = (ball: Ball, table: Table) => {
  if (table.balls.has(ball.id)) {
    table.balls.delete(ball.id);
    table.sockets.forEach((targetSocket) => targetSocket.emit(ServerToClientEventName.Deletion, ball.id));
  }

  if (getNumberOfNotOwnedBallsOnTable(table) == 0) addNotOwnedBallsToTable(table);
};

const checkCollisionWithScoreLines = (ball: Ball, table: Table) => {
  scoreLines.forEach(([pointA, pointB]) => {
    if (rewindToCollisionPoint(ball, ball.radius, pointA, pointB)) {
      deleteBallFromTable(ball, table);

      if (ball.ownerSocketId) {
        const socket = table.sockets.get(ball.ownerSocketId);

        if (socket) {
          const negativeScore = -ball.value;
          socket.data.score = Math.max(0, (socket.data.score as number) + negativeScore);
          socket.emit(ServerToClientEventName.Scored, negativeScore, ball.cpos.x, ball.cpos.y);
          createBallForSocket(socket);
        }
      }

      if (ball.lastTouchedBySocketId) {
        const socket = table.sockets.get(ball.lastTouchedBySocketId);

        if (socket) {
          socket.data.score = (socket.data.score as number) + ball.value;
          socket.emit(ServerToClientEventName.Scored, ball.value, ball.cpos.x, ball.cpos.y);
        }
      }
    }
  });
};

const emitObjectsPositionsToConnectedSockets = () => {
  Array.from(tables.values())
    .filter((table) => table.balls.size)
    .forEach((table) => {
      const positions = Array.from(table.balls.values()).reduce<BallsPositions>((resultArray, ball) => {
        resultArray.push([ball.id, Math.trunc(ball.cpos.x), Math.trunc(ball.cpos.y)]);
        return resultArray;
      }, []);

      table.sockets.forEach((socket) => {
        socket.emit(ServerToClientEventName.Positions, positions);
      });
    });
};

const emitScoreboardToConnectedSockets = () => {
  tables.forEach((table) => {
    const scoreboard = Array.from(table.sockets.values())
      .sort((a, b) => (b.data.score as number) - (a.data.score as number))
      .reduce<Scoreboard>((scoreboard, socket) => {
        scoreboard.push([socket.data.nickname as string, socket.data.score as number, table.id as number]);
        return scoreboard;
      }, []);

    table.sockets.forEach((socket) => socket.emit(ServerToClientEventName.Scoreboard, scoreboard));
  });
};

const handleUpdateOnTimePassedSinceLastStateUpdateEmitted = (timePassed: number) => {
  if (timePassed > objectsPositionsUpdateMillisecondsInterval) {
    emitObjectsPositionsToConnectedSockets();
    publishTimePassedSinceLastStateUpdateEmitted(timePassed - objectsPositionsUpdateMillisecondsInterval);
  }
};

const handleUpdateOnTimePassedSinceLastScoreboardUpdate = (timePassed: number) => {
  if (timePassed > scoreboardUpdateMillisecondsInterval) {
    emitScoreboardToConnectedSockets();
    publishTimePassedSinceLastScoreboardUpdate(timePassed - scoreboardUpdateMillisecondsInterval);
  }
};

const updatePhysics = (deltaTime: number) => {
  tables.forEach((table) => {
    Array.from(table.balls.values()).forEach((ball, _, balls) => {
      accelerate(ball, deltaTime);

      balls
        .filter((otherNetworkObject) => ball !== otherNetworkObject && isColliding(ball, otherNetworkObject))
        .forEach((otherNetworkObject) => handleCollision(ball, otherNetworkObject));

      checkCollisionWithTableEdges(ball);

      checkCollisionWithScoreLines(ball, table);

      inertia(ball);
    });
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
  publishTimePassedSinceLastScoreboardUpdate(getTimePassedSinceLastScoreboardUpdate() + deltaTime);
};

const addNotOwnedBallsToTable = (table: Table) => {
  for (let value = 1; value <= 8; value++) {
    const x = getRandomPositionForBallOnTable();
    const y = getRandomPositionForBallOnTable();
    addBallToTable(table, {
      cpos: { x, y },
      ppos: { x, y },
      radius: ballRadius,
      value,
      label: `${value}`,
      color: ballColors[value],
    });
  }
};

const addSocketToTable = (socket: GameSocket, table: Table) => {
  table.sockets.set(socket.id, socket);
  socket.data.table = table;
  createBallForSocket(socket);

  socket.emit(ServerToClientEventName.Objects, Array.from(table.balls.values()));

  broadcastChatMessageToAllTables(`📢 ${socket.data.nickname} joined Table ${table.id}!`);
};

const removeSocketFromTable = (socket: GameSocket, table: Table) => {
  broadcastChatMessageToAllTables(`📢 ${socket.data.nickname} left Table ${table.id}.`);
  deleteBallFromSocket(socket);
  table.sockets.delete(socket.id);
  socket.data.table = undefined;
};

const createTable = () => {
  const table = {
    id: getUniqueId(),
    sockets: new Map<string, GameSocket>(),
    balls: new Map<number, Ball>(),
  } as Table;

  tables.set(table.id, table);

  addNotOwnedBallsToTable(table);

  return table;
};

subscribeToTimePassedSinceLastScoreboardUpdate(handleUpdateOnTimePassedSinceLastScoreboardUpdate);
subscribeToTimePassedSinceLastStateUpdateEmitted(handleUpdateOnTimePassedSinceLastStateUpdateEmitted);

MainLoop.setUpdate(handleMainLoopUpdate).start();

export default { io: handleSocketConnected };
