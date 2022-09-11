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
  ballsPositionsUpdatesPerSecond,
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

const gameStateUpdateFramesInterval = gameFramesPerSecond / ballsPositionsUpdatesPerSecond;

const ballIdToBallSpriteMap = new Map<number, Sprite>();

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

const [publishSoundEnabled, , isSoundEnabled] = createPubSub(false);

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

function setCanvasWidthAndHeight() {
  canvas.width = canvas.height = squareCanvasSizeInPixels;
}

function prepareGame() {
  updateDocumentTitleWithGameName();
  printWelcomeMessage();
  setCanvasWidthAndHeight();
  handleWindowResized();
  initPointer({ radius: 0 });
  publishGamePreparationComplete();
}

function emitPointerPressedIfNeeded() {
  if (!isPointerPressed() || Date.now() - getLastTimeEmittedPointerPressed() < 1000 / ballsPositionsUpdatesPerSecond)
    return;
  const { x, y } = getPointer();
  socket.emit(ClientToServerEventName.Click, Math.trunc(x), Math.trunc(y));
  setLastTimeEmittedPointerPressed(Date.now());
}

function updateScene() {
  emitPointerPressedIfNeeded();

  ballIdToBallSpriteMap.forEach((sprite) => {
    const newRotationDegree = radToDeg(sprite.rotation) + (Math.abs(sprite.dx) + Math.abs(sprite.dy)) * 7;
    sprite.rotation = degToRad(newRotationDegree > 360 ? newRotationDegree - 360 : newRotationDegree);
    sprite.update();
  });

  scoreTextPool.update();
}

function drawLine(fromPoint: { x: number; y: number }, toPoint: { x: number; y: number }) {
  context.beginPath();
  context.strokeStyle = "#fff";
  context.moveTo(fromPoint.x, fromPoint.y);
  context.lineTo(toPoint.x, toPoint.y);
  context.stroke();
}

function renderOtherSprites() {
  ballIdToBallSpriteMap.forEach((sprite) => {
    if (sprite !== getOwnSprite()) sprite.render();
  });
}

function renderOwnSpritePossiblyWithWire() {
  const ownSprite = getOwnSprite();

  if (!ownSprite) return;

  if (isPointerPressed()) drawLine(ownSprite.position, getPointer());

  ownSprite.render();
}

function renderScene() {
  tableSprite.render();
  renderOtherSprites();
  renderOwnSpritePossiblyWithWire();
  scoreTextPool.render();
}

function startMainLoop() {
  return GameLoop({ update: publishMainLoopUpdate, render: publishMainLoopDraw }).start();
}

function fitCanvasInsideItsParent(canvasElement: HTMLCanvasElement) {
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
}

function handleBallsPositionsReceived(balls: Ball[]) {
  ballIdToBallSpriteMap.clear();

  balls.forEach((ball) => createSpriteForBall(ball));
}

function createSpriteForBall(ball: Ball) {
  const sprite = Sprite({
    x: squareCanvasSizeInPixels / 2,
    y: squareCanvasSizeInPixels / 2,
    anchor: { x: 0.5, y: 0.5 },
    render: () => {
      sprite.context.fillStyle = ball.color;
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
    text: ball.label,
    font: `${ballRadius}px monospace`,
    color: "black",
    anchor: { x: 0.5, y: 0.5 },
    textAlign: "center",
  });
  sprite.addChild(ballLabel);

  ballIdToBallSpriteMap.set(ball.id, sprite);

  if (ball.ownerSocketId === socket.id) setOwnSprite(sprite);

  return sprite;
}

function setSpriteVelocity(expectedPosition: Vector, sprite: Sprite) {
  const difference = expectedPosition.subtract(sprite.position);
  sprite.dx = difference.x / gameStateUpdateFramesInterval;
  sprite.dy = difference.y / gameStateUpdateFramesInterval;
}

function stopSprite(sprite: Sprite) {
  sprite.ddx = sprite.ddy = sprite.dx = sprite.dy = 0;
}

function handleChatMessageReceived(message: string) {
  playSound(messageReceivedSound);
  chatHistory.value += `${getHoursFromLocalTime()}:${getMinutesFromLocalTime()} ${message}\n`;
  if (chatHistory !== document.activeElement) chatHistory.scrollTop = chatHistory.scrollHeight;
}

function getMinutesFromLocalTime() {
  return new Date().getMinutes().toString().padStart(2, "0");
}

function getHoursFromLocalTime() {
  return new Date().getHours().toString().padStart(2, "0");
}

function sendChatMessage() {
  const messageToSend = chatInputField.value.trim();
  chatInputField.value = "";
  if (!messageToSend.length) {
    return;
  } else if (messageToSend.startsWith("/help")) {
    return printHelpText();
  } else if (messageToSend.startsWith("/soundon")) {
    handleChatMessageReceived("📢 Sounds enabled.");
    return publishSoundEnabled(true);
  } else if (messageToSend.startsWith("/soundoff")) {
    handleChatMessageReceived("📢 Sounds disabled.");
    return publishSoundEnabled(false);
  } else {
    socket.emit(ClientToServerEventName.Message, messageToSend);
  }
}

function handleKeyPressedOnChatInputField(event: KeyboardEvent) {
  if (event.key === "Enter") sendChatMessage();
}

function updateInnerHeightProperty() {
  document.documentElement.style.setProperty("--inner-height", `${window.innerHeight}px`);
}

function handleWindowResized() {
  updateInnerHeightProperty();
  fitCanvasInsideItsParent(canvas);
}

function playSound(sound: (number | undefined)[]) {
  if (isSoundEnabled()) zzfx(...sound);
}

function enableSounds() {
  publishSoundEnabled(true);
  playSound(messageReceivedSound);
}

function handlePointerDown() {
  if (!getOwnSprite()) return;
  playSound(acceleratingSound);
  publishPointerPressed(true);
}

function handlePointerUp() {
  publishPointerPressed(false);
}

function handleObjectDeleted(id: number) {
  const spriteToDelete = ballIdToBallSpriteMap.get(id);

  if (!spriteToDelete) return;

  if (spriteToDelete === getOwnSprite()) setOwnSprite(null);

  ballIdToBallSpriteMap.delete(id);
}

function handlePositionsUpdated(positions: BallsPositions): void {
  positions.forEach(([objectId, x, y]) => {
    const sprite = ballIdToBallSpriteMap.get(objectId);
    if (sprite) {
      const expectedPosition = Vector(x, y);
      expectedPosition.distance(sprite.position) != 0
        ? setSpriteVelocity(expectedPosition, sprite)
        : stopSprite(sprite);
    }
  });
}

function handleScoreboardUpdated(overallScoreboard: Scoreboard, tableScoreboard: Scoreboard): void {
  let zeroPaddingLengthForScore = 0;

  if (overallScoreboard[0]) {
    const [, score] = overallScoreboard[0];
    zeroPaddingLengthForScore = score.toString().length;
  }

  const maxNickLength = overallScoreboard.reduce((maxLength, [nick]) => Math.max(maxLength, nick.length), 0);

  scoreboardTextArea.value = "TABLE SCOREBOARD\n\n";

  function writeScore([nick, score, tableId]: [nick: string, score: number, tableId: number]) {
    const formattedScore = String(score).padStart(zeroPaddingLengthForScore, "0");
    const formattedNick = nick.padEnd(maxNickLength, " ");
    scoreboardTextArea.value += `${formattedScore} | ${formattedNick} | Table ${tableId}\n`;
  }

  tableScoreboard.forEach(writeScore);

  scoreboardTextArea.value += "\n\nOVERALL SCOREBOARD\n\n";

  overallScoreboard.forEach(writeScore);
}

function handleScoredEvent(value: number, x: number, y: number) {
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
}

function handlePointerPressed(isPointerPressed: boolean) {
  canvas.style.cursor = isPointerPressed ? "grabbing" : "grab";
}

function printWelcomeMessage() {
  return handleChatMessageReceived(
    `👋 Welcome to ${gameName}!\n\nℹ️ New to this game? Enter /help in the message field below to learn about it.\n`
  );
}

function updateDocumentTitleWithGameName() {
  document.title = gameName;
}

function printHelpText() {
  handleChatMessageReceived(
    `ℹ️ ${gameName} puts you in control of a yoyo on a multiplayer pool table!\n\n` +
      `The goal is to keep the highest score as long as possible.\n\n` +
      `Click or touch the table to pull your yoyo.\n\n` +
      `Each ball has a value, and you should use yoyo maneuvers to bring them into the corner pockets.\n\n` +
      `If you push another yoyo into a corner pocket, you get part of their score, implying that you also lose part of your score if you end up in a corner pocket.\n\n` +
      `When the table is clean, balls are brought back to the table. Tip: Focus on pocketing the balls with high value first.\n\n` +
      `There are several tables in the room, and you can communicate with players from other tables through this chat.\n\n` +
      `You can also run the following commands here:\n\n` +
      `Command: /nick <nickname>\n` +
      `Effect: Changes your nickname.\n\n` +
      `Command: /newtable\n` +
      `Effect: Starts a new game on an empty table.\n\n` +
      `Command: /jointable <number>\n` +
      `Effect: Joins the game from a specific table.\n\n` +
      `Command: /soundon\n` +
      `Effect: Enables sounds.\n\n` +
      `Command: /soundoff\n` +
      `Effect: Disables sounds.\n`
  );
}

subscribeToMainLoopUpdate(updateScene);
subscribeToMainLoopDraw(renderScene);
subscribeToGamePreparationCompleted(startMainLoop);
subscribeToPageWithImagesLoaded(prepareGame);
subscribeToPointerPressed(handlePointerPressed);
onPointer("down", handlePointerDown);
onPointer("up", handlePointerUp);
window.addEventListener("load", publishPageWithImagesLoaded);
window.addEventListener("resize", handleWindowResized);
window.addEventListener("click", enableSounds, { once: true });
chatButton.addEventListener("click", sendChatMessage);
chatInputField.addEventListener("keyup", handleKeyPressedOnChatInputField);
socket.on(ServerToClientEventName.Message, handleChatMessageReceived);
socket.on(ServerToClientEventName.Objects, handleBallsPositionsReceived);
socket.on(ServerToClientEventName.Positions, handlePositionsUpdated);
socket.on(ServerToClientEventName.Creation, createSpriteForBall);
socket.on(ServerToClientEventName.Deletion, handleObjectDeleted);
socket.on(ServerToClientEventName.Scored, handleScoredEvent);
socket.on(ServerToClientEventName.Scoreboard, handleScoreboardUpdated);
