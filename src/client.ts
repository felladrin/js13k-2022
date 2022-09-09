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
import { Socket } from "socket.io-client";
import { zzfx } from "zzfx";
import {
  NetworkObjectsPositions,
  networkObjectsUpdatesPerSecond,
  NetworkObject,
  squareCanvasSizeInPixels,
  ServerToClientEvents,
  ClientToServerEvents,
  ballRadius,
  ClientToServerEventName,
  ServerToClientEventName,
  Scoreboard,
} from "./shared";

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

const [setOwnSprite, , getOwnSprite] = createPubSub<Sprite | null>(null);

const [setPointerPressed, , isPointerPressed] = createPubSub(false);

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

const handleNetworkObjectsReceived = (networkObjects: NetworkObject[]) => {
  networkObjectIdToSpriteMap.clear();

  networkObjects.forEach((networkObject) => createSpriteForNetworkObject(networkObject));
};

const createSpriteForNetworkObject = (networkObject: NetworkObject) => {
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
  chatHistory.value += `[${getHoursFromLocalTime()}:${getMinutesFromLocalTime()}] ${message}\n`;
  if (chatHistory !== document.activeElement) chatHistory.scrollTop = chatHistory.scrollHeight;
};

const getMinutesFromLocalTime = () => new Date().getMinutes().toString().padStart(2, "0");

const getHoursFromLocalTime = () => new Date().getHours().toString().padStart(2, "0");

const sendChatMessage = () => {
  const messageToSend = chatInputField.value.trim();
  if (!messageToSend.length) return;
  socket.emit(ClientToServerEventName.Message, messageToSend);
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
  setPointerPressed(true);
};

const handleObjectDeleted = (id: number) => {
  const spriteToDelete = networkObjectIdToSpriteMap.get(id);

  if (!spriteToDelete) return;

  if (spriteToDelete === getOwnSprite()) setOwnSprite(null);

  networkObjectIdToSpriteMap.delete(id);
};

const handlePositionsUpdated = (positions: NetworkObjectsPositions): void => {
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

const handleScoreboardUpdated = (scoreboard: Scoreboard): void => {
  scoreboardTextArea.value = "SCOREBOARD\n\n";
  scoreboard.forEach(([nick, score]) => {
    scoreboardTextArea.value += `${score}\t${nick}\n`;
  });
};
const handleScoredEvent = (value: number, x: number, y: number) => {
  playSound(value < 0 ? scoreDecreasedSound : scoreIncreasedSound);

  const scoreText = scoreTextPool.get({
    text: `${value > 0 ? "+" : ""}${value}`,
    font: "48px monospace",
    color: value < 0 ? "purple" : "gold",
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
  } as Text) as Text;
};

subscribeToMainLoopUpdate(updateScene);
subscribeToMainLoopDraw(renderScene);
subscribeToGamePreparationCompleted(startMainLoop);
subscribeToPageWithImagesLoaded(prepareGame);
onPointer("down", handlePointerDown);
onPointer("up", () => setPointerPressed(false));
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
