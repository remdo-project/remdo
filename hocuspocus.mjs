import { Logger } from "@hocuspocus/extension-logger";
import { Hocuspocus } from "@hocuspocus/server";

const server = new Hocuspocus({
  extensions: [new Logger()],
  port: 8080,
});

server.listen();
