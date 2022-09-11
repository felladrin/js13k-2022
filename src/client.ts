import type { Socket } from "socket.io-client";
import { createPubSub } from "create-pubsub";
import {
  init,
  GameLoop,
  Vector,
  Text,
  Sprite,
  initPointer,
  onPointer,
  getPointer,
  degToRad,
  radToDeg,
  Pool,
} from "kontra";
import {
  BallsPositions,
  networkObjectsUpdatesPerSecond,
  Ball,
  squareCanvasSizeInPixels,
  ServerToClientEvents,
  ClientToServerEvents,
  ballRadius,
  ClientToServerEventName,
  ServerToClientEventName,
  Scoreboard,
} from "./shared";
import { zzfx } from "zzfx";

const gameName = "YoYo Haku Pool";

const gameFramesPerSecond = 60;

const gameStateUpdateFramesInterval = gameFramesPerSecond / networkObjectsUpdatesPerSecond;

const networkObjectIdToSpriteMap = new Map<number, Sprite>();

const { canvas, context } = init(document.querySelector("#canvas") as HTMLCanvasElement);

const scoreboardTextArea = document.querySelector("#b1 textarea") as HTMLTextAreaElement;

const chatHistory = document.querySelector("#b2 textarea") as HTMLTextAreaElement;

const chatInputField = document.querySelector("#b3 input") as HTMLInputElement;

const chatButton = document.querySelector("#b4 button") as HTMLButtonElement;

const tableImage = document.querySelector("img[src='table.webp']") as HTMLImageElement;

const socket = io({ upgrade: false, transports: ["websocket"] }) as Socket<ServerToClientEvents, ClientToServerEvents>;

const [publishMainLoopUpdate, subscribeToMainLoopUpdate] = createPubSub<number>();

const [publishMainLoopDraw, subscribeToMainLoopDraw] = createPubSub<number>();

const [publishPageWithImagesLoaded, subscribeToPageWithImagesLoaded] = createPubSub<Event>();

const [publishGamePreparationComplete, subscribeToGamePreparationCompleted] = createPubSub();

const [publishPointerPressed, subscribeToPointerPressed, isPointerPressed] = createPubSub(false);

const [setOwnSprite, , getOwnSprite] = createPubSub<Sprite | null>(null);

const [setLastTimeEmittedPointerPressed, , getLastTimeEmittedPointerPressed] = createPubSub(Date.now());

const messageReceivedSound = [2.01, , 773, 0.02, 0.01, 0.01, 1, 1.14, 44, -27, , , , , 0.9, , 0.18, 0.81, 0.01];

const scoreIncreasedSound = [
  1.35,
  ,
  151,
  0.1,
  0.17,
  0.26,
  1,
  0.34,
  -4.1,
  -5,
  -225,
  0.02,
  0.14,
  0.1,
  ,
  0.1,
  0.13,
  0.9,
  0.22,
  0.17,
];

const acceleratingSound = [, , 999, 0.2, 0.04, 0.15, 4, 2.66, -0.5, 22, , , , 0.1, , , , , 0.02];

const scoreDecreasedSound = [, , 727, 0.02, 0.03, 0, 3, 0.09, 4.4, -62, , , , , , , 0.19, 0.65, 0.2, 0.51];

const tableSprite = Sprite({
  image: tableImage,
});

const scoreTextPool = Pool({
  create: Text as any,
});

const setCanvasWidthAndHeight = () => {
  canvas.width = canvas.height = squareCanvasSizeInPixels;
};

const prepareGame = () => {
  updateDocumentTitleWithGameName();
  printWelcomeMessage();
  setCanvasWidthAndHeight();
  handleWindowResized();
  initPointer({ radius: 0 });
  publishGamePreparationComplete();
};

const emitPointerPressedIfNeeded = () => {
  if (!isPointerPressed() || Date.now() - getLastTimeEmittedPointerPressed() < 1000 / networkObjectsUpdatesPerSecond)
    return;
  const { x, y } = getPointer();
  socket.emit(ClientToServerEventName.Click, Math.trunc(x), Math.trunc(y));
  setLastTimeEmittedPointerPressed(Date.now());
};

const updateScene = () => {
  emitPointerPressedIfNeeded();

  networkObjectIdToSpriteMap.forEach((sprite) => {
    const newRotationDegree = radToDeg(sprite.rotation) + (Math.abs(sprite.dx) + Math.abs(sprite.dy)) * 7;
    sprite.rotation = degToRad(newRotationDegree > 360 ? newRotationDegree - 360 : newRotationDegree);
    sprite.update();
  });

  scoreTextPool.update();
};

const drawLine = (fromPoint: { x: number; y: number }, toPoint: { x: number; y: number }) => {
  context.beginPath();
  context.strokeStyle = "#fff";
  context.moveTo(fromPoint.x, fromPoint.y);
  context.lineTo(toPoint.x, toPoint.y);
  context.stroke();
};

const renderOtherSprites = () => {
  networkObjectIdToSpriteMap.forEach((sprite) => {
    if (sprite !== getOwnSprite()) sprite.render();
  });
};

const renderOwnSpritePossiblyWithWire = () => {
  const ownSprite = getOwnSprite();

  if (!ownSprite) return;

  if (isPointerPressed()) drawLine(ownSprite.position, getPointer());

  ownSprite.render();
};

const renderScene = () => {
  tableSprite.render();
  renderOtherSprites();
  renderOwnSpritePossiblyWithWire();
  scoreTextPool.render();
};

const startMainLoop = () => GameLoop({ update: publishMainLoopUpdate, render: publishMainLoopDraw }).start();

const fitCanvasInsideItsParent = (canvasElement: HTMLCanvasElement) => {
  if (!canvasElement.parentElement) return;
  const { width, height, style, parentElement } = canvasElement;
  const { clientWidth, clientHeight } = parentElement;
  const widthScale = clientWidth / width;
  const heightScale = clientHeight / height;
  const scale = widthScale < heightScale ? widthScale : heightScale;
  style.marginTop = `${(clientHeight - height * scale) / 2}px`;
  style.marginLeft = `${(clientWidth - width * scale) / 2}px`;
  style.width = `${width * scale}px`;
  style.height = `${height * scale}px`;
};

const handleNetworkObjectsReceived = (networkObjects: Ball[]) => {
  networkObjectIdToSpriteMap.clear();

  networkObjects.forEach((networkObject) => createSpriteForNetworkObject(networkObject));
};

const createSpriteForNetworkObject = (networkObject: Ball) => {
  const sprite = Sprite({
    x: squareCanvasSizeInPixels / 2,
    y: squareCanvasSizeInPixels / 2,
    anchor: { x: 0.5, y: 0.5 },
    render: () => {
      sprite.context.fillStyle = networkObject.color;
      sprite.context.beginPath();
      sprite.context.arc(0, 0, ballRadius, 0, 2 * Math.PI);
      sprite.context.fill();
    },
  });

  const whiteCircle = Sprite({
    anchor: { x: 0.5, y: 0.5 },
    render: () => {
      sprite.context.fillStyle = "#fff";
      sprite.context.beginPath();
      sprite.context.arc(0, 0, ballRadius / 1.5, 0, 2 * Math.PI);
      sprite.context.fill();
    },
  });
  sprite.addChild(whiteCircle);

  const ballLabel = Text({
    text: networkObject.label,
    font: `${ballRadius}px monospace`,
    color: "black",
    anchor: { x: 0.5, y: 0.5 },
    textAlign: "center",
  });
  sprite.addChild(ballLabel);

  networkObjectIdToSpriteMap.set(networkObject.id, sprite);

  if (networkObject.ownerSocketId === socket.id) setOwnSprite(sprite);

  return sprite;
};

const setSpriteVelocity = (expectedPosition: Vector, sprite: Sprite) => {
  const difference = expectedPosition.subtract(sprite.position);
  sprite.dx = difference.x / gameStateUpdateFramesInterval;
  sprite.dy = difference.y / gameStateUpdateFramesInterval;
};

const stopSprite = (sprite: Sprite) => {
  sprite.ddx = sprite.ddy = sprite.dx = sprite.dy = 0;
};

const handleChatMessageReceived = (message: string) => {
  playSound(messageReceivedSound);
  chatHistory.value += `${getHoursFromLocalTime()}:${getMinutesFromLocalTime()} ${message}\n`;
  if (chatHistory !== document.activeElement) chatHistory.scrollTop = chatHistory.scrollHeight;
};

const getMinutesFromLocalTime = () => new Date().getMinutes().toString().padStart(2, "0");

const getHoursFromLocalTime = () => new Date().getHours().toString().padStart(2, "0");

const sendChatMessage = () => {
  const messageToSend = chatInputField.value.trim();
  chatInputField.value = "";
  if (!messageToSend.length) return;
  if (messageToSend.startsWith("/help")) return printHelpText();
  socket.emit(ClientToServerEventName.Message, messageToSend);
};

const handleKeyPressedOnChatInputField = (event: KeyboardEvent) => {
  if (event.key === "Enter") sendChatMessage();
};

const updateInnerHeightProperty = () => {
  document.documentElement.style.setProperty("--inner-height", `${window.innerHeight}px`);
};

const handleWindowResized = () => {
  updateInnerHeightProperty();
  fitCanvasInsideItsParent(canvas);
};

const [publishSoundEnabled, , isSoundEnabled] = createPubSub(false);

const playSound = (sound: (number | undefined)[]) => {
  if (isSoundEnabled()) zzfx(...sound);
};

const enableSounds = () => {
  publishSoundEnabled(true);
  playSound(messageReceivedSound);
};

const handlePointerDown = () => {
  if (!getOwnSprite()) return;
  playSound(acceleratingSound);
  publishPointerPressed(true);
};

const handleObjectDeleted = (id: number) => {
  const spriteToDelete = networkObjectIdToSpriteMap.get(id);

  if (!spriteToDelete) return;

  if (spriteToDelete === getOwnSprite()) setOwnSprite(null);

  networkObjectIdToSpriteMap.delete(id);
};

const handlePositionsUpdated = (positions: BallsPositions): void => {
  positions.forEach(([objectId, x, y]) => {
    const sprite = networkObjectIdToSpriteMap.get(objectId);
    if (sprite) {
      const expectedPosition = Vector(x, y);
      expectedPosition.distance(sprite.position) != 0
        ? setSpriteVelocity(expectedPosition, sprite)
        : stopSprite(sprite);
    }
  });
};

const handleScoreboardUpdated = (overallScoreboard: Scoreboard, tableScoreboard: Scoreboard): void => {
  let zeroPaddingLengthForScore = 0;

  if (overallScoreboard[0]) {
    const [, score] = overallScoreboard[0];
    zeroPaddingLengthForScore = score.toString().length;
  }

  const maxNickLength = overallScoreboard.reduce((maxLength, [nick]) => Math.max(maxLength, nick.length), 0);

  scoreboardTextArea.value = "TABLE SCOREBOARD\n\n";

  const writeScore = ([nick, score, tableId]: [nick: string, score: number, tableId: number]) => {
    const formattedScore = String(score).padStart(zeroPaddingLengthForScore, "0");
    const formattedNick = nick.padEnd(maxNickLength, " ");
    scoreboardTextArea.value += `${formattedScore} | ${formattedNick} | Table ${tableId}\n`;
  };

  tableScoreboard.forEach(writeScore);

  scoreboardTextArea.value += "\n\nOVERALL SCOREBOARD\n\n";

  overallScoreboard.forEach(writeScore);
};
const handleScoredEvent = (value: number, x: number, y: number) => {
  playSound(value < 0 ? scoreDecreasedSound : scoreIncreasedSound);

  const scoreText = scoreTextPool.get({
    text: `${value > 0 ? "+" : ""}${value}${value > 0 ? "✨" : "💀"}`,
    font: "36px monospace",
    color: value > 0 ? "#F9D82B" : "#3B3B3B",
    x,
    y,
    anchor: { x: 0.5, y: 0.5 },
    textAlign: "center",
    dy: -1,
    dx: 1,
    update: () => {
      scoreText.advance();

      scoreText.opacity -= 0.01;

      if (scoreText.opacity < 0) scoreText.ttl = 0;

      if (scoreText.x > x + 2 || scoreText.x < x - 2) scoreText.dx *= -1;
    },
  }) as Text;
};

const handlePointerPressed = (isPointerPressed: boolean) => {
  canvas.style.cursor = isPointerPressed ? "grabbing" : "grab";
};

const printWelcomeMessage = () =>
  handleChatMessageReceived(
    `👋 Welcome to ${gameName}!\n\nℹ️ New to this game? Enter /help in the message field below to learn about it.\n`
  );

const updateDocumentTitleWithGameName = () => {
  document.title = gameName;
};

subscribeToMainLoopUpdate(updateScene);
subscribeToMainLoopDraw(renderScene);
subscribeToGamePreparationCompleted(startMainLoop);
subscribeToPageWithImagesLoaded(prepareGame);
subscribeToPointerPressed(handlePointerPressed);
onPointer("down", handlePointerDown);
onPointer("up", () => publishPointerPressed(false));
window.addEventListener("load", publishPageWithImagesLoaded);
window.addEventListener("resize", handleWindowResized);
window.addEventListener("click", enableSounds, { once: true });
chatButton.addEventListener("click", sendChatMessage);
chatInputField.addEventListener("keyup", handleKeyPressedOnChatInputField);
socket.on(ServerToClientEventName.Message, handleChatMessageReceived);
socket.on(ServerToClientEventName.Objects, handleNetworkObjectsReceived);
socket.on(ServerToClientEventName.Positions, handlePositionsUpdated);
socket.on(ServerToClientEventName.Creation, createSpriteForNetworkObject);
socket.on(ServerToClientEventName.Deletion, handleObjectDeleted);
socket.on(ServerToClientEventName.Scored, handleScoredEvent);
socket.on(ServerToClientEventName.Scoreboard, handleScoreboardUpdated);

function printHelpText() {
  handleChatMessageReceived(
    `ℹ️ ${gameName} puts you in control of a yoyo on a multiplayer pool table!\n\n` +
      `Your objective is to keep the highest score as long as possible.\n\n` +
      `Each ball has a value, and you should use yoyo maneuvers to pull them into the corner pockets.\n\n` +
      `If you manage to pull other yoyo into a corner pocket, you take part of their score.\n\n` +
      `And if end up in a corner pocket, you lose score.\n\n` +
      `Use this chat area to communicate with other players and run commands.\n\n` +
      `Here's the list of commands you can run:\n\n` +
      `- Command: /nick <nickname>\n` +
      `  Description: Changes your nickname.\n\n` +
      `- Command: /newtable\n` +
      `  Description: Creates a new table.\n\n` +
      `- Command: /jointable <number>\n` +
      `  Description: Joins an specific table.\n`
  );
}
