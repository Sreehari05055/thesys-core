import type { Express } from "express";
import { createServer, type Server } from "http";

export async function registerRoutes(
  httpServer: Server,
  _app: Express,
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api
  return httpServer;
}
