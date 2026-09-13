import express from "express";
import {Redis} from "ioredis";
import { MongoClient } from "mongodb";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB ?? "northwind";

const redis = new Redis(REDIS_URL);
const mongo = new MongoClient(MONGO_URL);

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const ordersAccepted = new Counter({
  name: "orders_accepted_total",
  help: "Total orders accepted by the API",
  registers: [registry]
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.post("/orders", async (req, res) => {
  const { product, quantity } = req.body ?? {};

  if (typeof product !== "string" || !product.trim() ||
      !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: "product and positive integer quantity are required"
    });
  }

  const order = {
    id: crypto.randomUUID(),
    product,
    quantity,
    createdAt: new Date().toISOString()
  };

  await redis.rpush("orders", JSON.stringify(order));
  ordersAccepted.inc();

  return res.status(202).json({
    message: "order queued",
    orderId: order.id
  });
});

app.get("/orders/count", async (_req, res) => {
  const db = mongo.db(MONGO_DB);
  const count = await db.collection("orders").countDocuments();
  res.json({ processedOrders: count });
});

async function start() {
  await mongo.connect();
  await redis.ping();

  app.listen(PORT, () => {
    console.log(`API listening on ${PORT}`);
  });
}

start().catch((error) => {
  console.error("API startup failed", error);
  process.exit(1);
});
