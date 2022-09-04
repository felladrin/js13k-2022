import { defineConfig } from "rollup";
import { terser } from "rollup-plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";
import watch from "rollup-plugin-watch";

export default defineConfig([
  {
    input: "src/server.ts",
    output: [
      {
        file: "js13kserver/public/server.js",
        format: "commonjs",
        exports: "default",
      },
    ],
    plugins: [
      typescript(),
      nodeResolve(),
      commonjs(),
      terser({
        format: {
          comments: false,
        },
      }),
    ],
  },
  {
    input: "src/client.ts",
    output: [
      {
        file: "js13kserver/public/client.js",
        format: "iife",
        name: "client",
      },
    ],
    plugins: [
      typescript(),
      nodeResolve(),
      commonjs(),
      terser({
        format: {
          comments: false,
        },
      }),
      watch({ dir: "public" }),
      copy({ targets: [{ src: "public/**/*", dest: "js13kserver/public" }] }),
    ],
  },
]);
