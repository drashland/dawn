import { socket } from "./socket.ts";
import {server} from "./server.ts";

export async function startServers () {
  await server.run({
    hostname: "localhost",
    port: 64942
  })
  await socket.run({
    hostname: "localhost",
    port: 64943
  })
}

export async function closeServers () {
  try {
    server.close()
  } catch (err) {
    // do nothing
  }
  await socket.close()
}
