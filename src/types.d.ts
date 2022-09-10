declare const io: typeof import("socket.io-client").io;

declare module "zzfx" {
  export function zzfx(
    volume?: number,
    randomness?: number,
    frequency?: number,
    attack?: number,
    sustain?: number,
    release?: number,
    shape?: number,
    shapeCurve?: number,
    slide?: number,
    deltaSlide?: number,
    pitchJump?: number,
    pitchJumpTime?: number,
    repeatTime?: number,
    noise?: number,
    modulation?: number,
    bitCrush?: number,
    delay?: number,
    sustainVolume?: number,
    decay?: number,
    tremolo?: number
  ): AudioBufferSourceNode;
}
