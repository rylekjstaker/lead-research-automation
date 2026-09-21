import { defineConfig } from "@trigger.dev/sdk";
const project = "proj_kswfgozoksabbpuwrrrs";

export default defineConfig({
  project,
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 300,
});

