import { createPubSub } from "create-pubsub";
import { init, GameLoop, Vector, Text, Sprite, initPointer, onPointer, getPointer, degToRad, radToDeg } from "kontra";
import { Socket } from "socket.io-client";
import { zzfx } from "zzfx";
import {
  canvasBottomRightPoint,
  canvasTopLeftPoint,
  GameState,
  gameStateUpdatesPerSecond,
  NetworkObject,
  squareCanvasSizeInPixels,
  gameFramesPerSecond,
  ServerToClientEvents,
  ClientToServerEvents,
  ballRadius,
} from "./shared";

const gameStateUpdateFramesInterval = gameFramesPerSecond / gameStateUpdatesPerSecond;

const networkObjectIdToSpriteMap = new Map<number, Sprite>();

const { canvas, context } = init(document.querySelector("#canvas") as HTMLCanvasElement);

const chatHistory = document.querySelector("#b textarea") as HTMLTextAreaElement;

const chatInputField = document.querySelector("#b input") as HTMLInputElement;

const chatButton = document.querySelector("#b button") as HTMLButtonElement;

const welcomePanel = document.querySelector("#z") as HTMLDivElement;

const tableImage = document.querySelector("#i0") as HTMLImageElement;

const ball1Image = document.querySelector("#i1") as HTMLImageElement;

const ball2Image = document.querySelector("#i2") as HTMLImageElement;

const ball3Image = document.querySelector("#i3") as HTMLImageElement;

const ball4Image = document.querySelector("#i4") as HTMLImageElement;

const ball5Image = document.querySelector("#i5") as HTMLImageElement;

const ball6Image = document.querySelector("#i6") as HTMLImageElement;

const ball7Image = document.querySelector("#i7") as HTMLImageElement;

const ball8Image = document.querySelector("#i8") as HTMLImageElement;

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

const messageReceivedSound = [2.01, , 773, 0.02, 0.01, 0.01, 1, 1.14, 44, -27, , , , , 0.9, , 0.18, 0.81, 0.01];

const collisionSound = [2.38, , 1458, 0.01, 0.01, 0.15, 1, 1.65, , , , , , , , 0.1, 0.08, 0.53];

const acceleratingSound = [, , 999, 0.2, 0.04, 0.15, 4, 2.66, -0.5, 22, , , , 0.1, , , , , 0.02];

const screamSound = [1.71, , 727, 0.02, 0.03, 0, 3, 0.09, 4.4, -62, , , , , , , 0.19, 0.65, 0.2, 0.51];

const canvasBackgrundSprite = Sprite({
  image: tableImage,
});

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
    const sprite = networkObjectIdToSpriteMap.get(networkObject.id);
    if (sprite) {
      sprite.update();
      // const newRotationDegree = radToDeg(sprite.rotation) + 7;
      // sprite.rotation = degToRad(newRotationDegree < 360 ? newRotationDegree : 0);
    }
  });
};

const drawLine = (fromPoint: { x: number; y: number }, toPoint: { x: number; y: number }) => {
  context.beginPath();
  context.strokeStyle = "#FFF";
  context.moveTo(fromPoint.x, fromPoint.y);
  context.lineTo(toPoint.x, toPoint.y);
  context.stroke();
};

const renderScene = () => {
  canvasBackgrundSprite.render();

  getGameState()?.networkObjects.forEach((networkObject) => {
    const sprite = networkObjectIdToSpriteMap.get(networkObject.id);

    if (isPointerPressed() && networkObject.ownerSocketId === socket.id && sprite) {
      drawLine(sprite.position, getPointer());
    }

    sprite?.render();
  });
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
    const sprite = networkObjectIdToSpriteMap.get(networkObject.id) ?? createSpriteForNetworkObject(networkObject);
    const expectedPosition = Vector(networkObject.cpos.x, networkObject.cpos.y);
    Math.abs(expectedPosition.distance(sprite.position)) > 1
      ? setSpriteVelocity(expectedPosition, sprite)
      : stopSprite(sprite);
  });
};

const createSpriteForNetworkObject = (networkObject: NetworkObject) => {
  const sprite = Sprite({
    x: 300,
    y: 300,
    anchor: { x: 0.5, y: 0.5 },
    render: () => {
      sprite.context.fillStyle = "#FFF";
      sprite.context.beginPath();
      sprite.context.arc(0, 0, ballRadius, 0, 2 * Math.PI);
      sprite.context.fill();
    },
  });
  networkObjectIdToSpriteMap.set(networkObject.id, sprite);
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
  chatHistory.value += `\n[${getHoursFromLocalTime()}:${getMinutesFromLocalTime()}] ${message}`;
  if (chatHistory !== document.activeElement) chatHistory.scrollTop = chatHistory.scrollHeight;
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

const updateInnerHeightProperty = () => {
  document.documentElement.style.setProperty("--inner-height", `${window.innerHeight}px`);
};

const handleWindowResized = () => {
  updateInnerHeightProperty();
  fitCanvasInsideItsParent(canvas);
};

const handleJoinButtonClicked = () => {
  socket.emit("nickname", chosenNickname.value);
  welcomePanel.remove();
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
  playSound(acceleratingSound);
  publishPointerPressed(true);
};

const handleObjectDeleted = (id: number) => {
  if (networkObjectIdToSpriteMap.has(id)) networkObjectIdToSpriteMap.delete(id);
};

subscribeToGameStateUpdated(handleGameStateUpdated);
subscribeToMainLoopUpdate(updateScene);
subscribeToMainLoopDraw(renderScene);
subscribeToGamePreparationCompleted(startMainLoop);
subscribeToPageWithImagesLoaded(prepareGame);
onPointer("down", handlePointerDown);
onPointer("up", () => publishPointerPressed(false));
window.addEventListener("load", publishPageWithImagesLoaded);
window.addEventListener("resize", handleWindowResized);
window.addEventListener("click", enableSounds, { once: true });
chatButton.addEventListener("click", sendChatMessage);
chatInputField.addEventListener("keyup", handleKeyPressedOnChatInputField);
joinButton.addEventListener("click", handleJoinButtonClicked);
socket.on("chat", handleChatMessageReceived);
socket.on("gameState", publishGameStateUpdated);
socket.on("objectDeleted", handleObjectDeleted);
socket.on("collision", () => playSound(collisionSound));
