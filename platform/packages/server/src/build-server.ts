import { createServer, type Server } from "node:http";
import { mapErrorToResponse } from "@ft/api";
import { uuidv7 } from "@ft/core";
import type { PlatformKernel } from "@ft/api";
import { readBody, toPlatformRequest, writeApiResponse } from "./http-adapter.js";

/**
 * Create the Node HTTP server that drives the kernel (doc 01, doc 08).
 *
 * Every request: read the body, normalize it, hand it to the kernel (which owns authn/tenancy/authz/
 * audit), and write the response with security headers. Errors that occur BEFORE the kernel (oversized
 * body, malformed JSON) are mapped to the same RFC 9457 problem shape so clients get one consistent
 * error format regardless of where the failure happened (doc 08/12).
 */
export function createHttpServer(kernel: PlatformKernel): Server {
  return createServer((req, res) => {
    void handle();

    async function handle(): Promise<void> {
      try {
        const body = await readBody(req);
        const platformRequest = toPlatformRequest(req, body);
        const response = await kernel.handle(platformRequest);
        writeApiResponse(res, response);
      } catch (error) {
        // Pre-kernel failure (body read/parse). Generate a correlation id for the problem response.
        const requestId = (req.headers["x-request-id"] as string | undefined) ?? uuidv7();
        writeApiResponse(res, mapErrorToResponse(error, requestId));
      }
    }
  });
}
