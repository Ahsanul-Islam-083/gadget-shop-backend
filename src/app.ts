import express from "express";
import cors from "cors";

import routes from "./routes";
import { errorHandler } from "@/lib/error-handler";

const app = express();

// Middlewares
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Home Route
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Welcome to Gadget Shop API",
  });
});

// API Routes
app.use("/api/v1", routes);

// 404 Route
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found",
  });
});

// Centralized error handler (must be registered last)
app.use(errorHandler);

export default app;