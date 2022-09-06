declare const io: typeof import("socket.io-client").io;

declare module "zzfx" {
  export function zzfx(...parameters: any[]): AudioBufferSourceNode;
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    x: AudioContext;
    play: (...parameters: any[]) => AudioBufferSourceNode;
    playSamples: (...samples: any[]) => AudioBufferSourceNode;
    buildSamples: (
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
    ) => number[];
    getNote: (semitoneOffset?: number, rootNoteFrequency?: number) => number;
  };
}
