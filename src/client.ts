import { createPubSub } from "create-pubsub";
import { init, GameLoop, Vector, Text, Sprite, initPointer, onPointer, getPointer } from "kontra";
import { Socket } from "socket.io-client";
import {
  canvasBottomRightPoint,
  canvasTopLeftPoint,
  GameState,
  gameStateUpdatesPerSecond,
  letterCircleRadius,
  NetworkObject,
  squareCanvasSizeInPixels,
  gameFramesPerSecond,
  ServerToClientEvents,
  ClientToServerEvents,
} from "./shared";

declare let io: typeof import("socket.io-client").io;

const gameStateUpdateFramesInterval = gameFramesPerSecond / gameStateUpdatesPerSecond;

const networkObjectIdToSpriteMap = new Map<number, Text>();

const { canvas, context } = init(document.querySelector("#canvas") as HTMLCanvasElement);

const chatHistory = document.querySelector("#b textarea") as HTMLTextAreaElement;

const chatInputField = document.querySelector("#b input") as HTMLInputElement;

const chatButton = document.querySelector("#b button") as HTMLButtonElement;

const welcomePanel = document.querySelector("#z") as HTMLDivElement;

const chosenNickname = welcomePanel.querySelector("input") as HTMLInputElement;

const joinButton = welcomePanel.querySelector("button") as HTMLButtonElement;

const socket = io({ upgrade: false, transports: ["websocket"] }) as Socket<ServerToClientEvents, ClientToServerEvents>;

const [publishMainLoopUpdate, subscribeToMainLoopUpdate] = createPubSub<number>();

const [publishMainLoopDraw, subscribeToMainLoopDraw] = createPubSub<number>();

const [publishPageWithImagesLoaded, subscribeToPageWithImagesLoaded] = createPubSub<Event>();

const [publishGamePreparationComplete, subscribeToGamePreparationCompleted] = createPubSub();

const [publishGameStateUpdated, subscribeToGameStateUpdated, getGameState] = createPubSub<GameState>();

const [publishPointerPressed, , isPointerPressed] = createPubSub(false);

const [publishLastTimeEmittedPointerPressed, , getLastTimeEmittedPointerPressed] = createPubSub(Date.now());

const Letter = {
  A: "🅐",
  B: "🅑",
  C: "🅒",
  D: "🅓",
  E: "🅔",
  F: "🅕",
  G: "🅖",
  H: "🅗",
  I: "🅘",
  J: "🅙",
  K: "🅚",
  L: "🅛",
  M: "🅜",
  N: "🅝",
  O: "🅞",
  P: "🅟",
  Q: "🅠",
  R: "🅡",
  S: "🅢",
  T: "🅣",
  U: "🅤",
  V: "🅥",
  W: "🅦",
  X: "🅧",
  Y: "🅨",
  Z: "🅩",
};

const canvasBordersColor = "darkslategrey";

const canvasBorderThickness = 3;

const canvasBorderSprites = [
  Sprite({
    x: canvasTopLeftPoint.x,
    y: canvasTopLeftPoint.y,
    anchor: { x: 0, y: 0 },
    width: squareCanvasSizeInPixels,
    height: canvasBorderThickness,
    color: canvasBordersColor,
  }),
  Sprite({
    x: canvasTopLeftPoint.x,
    y: canvasTopLeftPoint.y,
    anchor: { x: 0, y: 0 },
    width: canvasBorderThickness,
    height: squareCanvasSizeInPixels,
    color: canvasBordersColor,
  }),
  Sprite({
    x: canvasBottomRightPoint.x,
    y: canvasBottomRightPoint.y,
    anchor: { x: 1, y: 1 },
    width: squareCanvasSizeInPixels,
    height: canvasBorderThickness,
    color: canvasBordersColor,
  }),
  Sprite({
    x: canvasBottomRightPoint.x,
    y: canvasBottomRightPoint.y,
    anchor: { x: 1, y: 1 },
    width: canvasBorderThickness,
    height: squareCanvasSizeInPixels,
    color: canvasBordersColor,
  }),
];

const setCanvasWidthAndHeight = () => {
  canvas.width = canvas.height = squareCanvasSizeInPixels;
};

const prepareGame = () => {
  setCanvasWidthAndHeight();
  handleWindowResized();
  initPointer({ radius: 0 });
  publishGamePreparationComplete();
};

const emitPointerPressedIfNeeded = () => {
  if (!isPointerPressed() || Date.now() - getLastTimeEmittedPointerPressed() < 1000 / gameStateUpdatesPerSecond) return;
  const { x, y } = getPointer();
  socket.emit("pointerPressed", [x, y]);
  publishLastTimeEmittedPointerPressed(Date.now());
};

const updateScene = () => {
  emitPointerPressedIfNeeded();

  getGameState()?.networkObjects.forEach((networkObject) => {
    networkObjectIdToSpriteMap.get(networkObject.id)?.update();
  });
};

const drawLine = (fromPoint: { x: number; y: number }, toPoint: { x: number; y: number }) => {
  context.beginPath();
  context.strokeStyle = "white";
  context.moveTo(fromPoint.x, fromPoint.y);
  context.lineTo(toPoint.x, toPoint.y);
  context.stroke();
};

const renderScene = () => {
  getGameState()?.networkObjects.forEach((networkObject) => {
    const sprite = networkObjectIdToSpriteMap.get(networkObject.id);

    if (isPointerPressed() && networkObject.ownerSocketId === socket.id && sprite) {
      drawLine(sprite.position, getPointer());
    }

    sprite?.render();
  });

  canvasBorderSprites.forEach((sprite) => sprite.render());
};

const startMainLoop = () => {
  GameLoop({ update: publishMainLoopUpdate, render: publishMainLoopDraw, fps: gameFramesPerSecond }).start();
};

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

const handleGameStateUpdated = (gameState: GameState) => {
  gameState.networkObjects.forEach((networkObject) => {
    let sprite = networkObjectIdToSpriteMap.get(networkObject.id) ?? createSpriteForNetworkObject(networkObject);
    const expectedPosition = Vector(networkObject.cpos.x, networkObject.cpos.y);
    Math.abs(expectedPosition.distance(sprite.position)) > 1
      ? setSpriteVelocity(expectedPosition, sprite)
      : stopSprite(sprite);
  });
};

const createSpriteForNetworkObject = (networkObject: NetworkObject) => {
  const sprite = Text({
    text: Letter.K,
    font: `${letterCircleRadius * 2}px Arial`,
    anchor: { x: 0.5, y: 0.5 },
    textAlign: "center",
    color: "white",
    x: networkObject.ppos.x,
    y: networkObject.ppos.y,
  });
  networkObjectIdToSpriteMap.set(networkObject.id, sprite);
  return sprite;
};

const setSpriteVelocity = (expectedPosition: Vector, sprite: Text) => {
  const difference = expectedPosition.subtract(sprite.position);
  sprite.dx = difference.x / gameStateUpdateFramesInterval;
  sprite.dy = difference.y / gameStateUpdateFramesInterval;
};

const stopSprite = (sprite: Text) => {
  sprite.ddx = sprite.ddy = sprite.dx = sprite.dy = 0;
};

const handleChatMessageReceived = (message: string) => {
  chatHistory.value += `\n[${getHoursFromLocalTime()}:${getMinutesFromLocalTime()}] ${message}`;
  if (chatHistory !== document.activeElement) {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
};

const getMinutesFromLocalTime = () => new Date().getMinutes().toString().padStart(2, "0");

const getHoursFromLocalTime = () => new Date().getHours().toString().padStart(2, "0");

const sendChatMessage = () => {
  const messageToSend = chatInputField.value.trim();
  if (!messageToSend.length) return;
  socket.emit("chat", messageToSend);
  chatInputField.value = "";
};

const handleKeyPressedOnChatInputField = (event: KeyboardEvent) => {
  if (event.key === "Enter") sendChatMessage();
};

const adjustAppHeight = () => {
  document.documentElement.style.setProperty("--inner-height", `${window.innerHeight}px`);
};

const handleWindowResized = () => {
  adjustAppHeight();
  fitCanvasInsideItsParent(canvas);
};

const handleJoinButtonClicked = () => {
  socket.emit("nickname", chosenNickname.value.trim());
  welcomePanel.remove();
};

subscribeToGameStateUpdated(handleGameStateUpdated);
subscribeToMainLoopUpdate(updateScene);
subscribeToMainLoopDraw(renderScene);
subscribeToGamePreparationCompleted(startMainLoop);
subscribeToPageWithImagesLoaded(prepareGame);
onPointer("down", () => publishPointerPressed(true));
onPointer("up", () => publishPointerPressed(false));
window.addEventListener("load", publishPageWithImagesLoaded);
window.addEventListener("resize", handleWindowResized);
chatButton.addEventListener("click", sendChatMessage);
chatInputField.addEventListener("keyup", handleKeyPressedOnChatInputField);
joinButton.addEventListener("click", handleJoinButtonClicked);
socket.on("chat", handleChatMessageReceived);
socket.on("gameState", publishGameStateUpdated);
