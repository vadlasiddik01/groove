import http from "node:http";
import {Redis} from "ioredis";
import { MongoClient } from "mongodb";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

const PORT = Number(process.env.PORT ?? 3001);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB ?? "northwind";
const MEMORY_LEAK = process.env.CHAOS_MEMORY_LEAK === "true";
const HANG = process.env.CHAOS_HANG === "true";

const redis = new Redis(REDIS_URL);
const mongo = new MongoClient(MONGO_URL);

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const processed = new Counter({
  name: "orders_processed_total",
  help: "Total orders successfully processed",
  registers: [registry]
});

const failed = new Counter({
  name: "orders_failed_total",
  help: "Total orders that failed processing",
  registers: [registry]
});

const processingDuration = new Histogram({
  name: "order_processing_seconds",
  help: "Order processing duration in seconds",
  registers: [registry]
});

const memoryLeakBytes = new Gauge({
  name: "worker_simulated_leak_bytes",
  help: "Bytes retained by the intentional chaos memory leak",
  registers: [registry]
});

let healthy = true;
const retained: Buffer[] = [];

function healthServer() {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      if (HANG) {
        await new Promise(() => {});
        return;
      }
      res.writeHead(healthy ? 200 : 500, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: healthy ? "ok" : "unhealthy" }));
      return;
    }

    if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": registry.contentType });
      res.end(await registry.metrics());
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, () => console.log(`Worker health server listening on ${PORT}`));
}

async function processOrder(raw: string) {
  const end = processingDuration.startTimer();

  try {
    const order = JSON.parse(raw);

    // Simulate useful work.
    await new Promise((resolve) => setTimeout(resolve, 300));

    await mongo.db(MONGO_DB).collection("orders").insertOne({
      ...order,
      processedAt: new Date()
    });

    processed.inc();
  } catch (error) {
    failed.inc();
    console.error("Order processing failed", error);
  } finally {
    end();
  }
}

async function consume() {
  while (true) {
    const result = await redis.blpop("orders", 5);
    if (!result) continue;

    const [, raw] = result;
    await processOrder(raw);
  }
}

function startMemoryLeak() {
  if (!MEMORY_LEAK) return;

  console.log("CHAOS: gradual memory leak enabled");

  setInterval(() => {
    // Intentionally retain 1 MiB every second.
    retained.push(Buffer.alloc(1024 * 1024));
    const bytes = retained.length * 1024 * 1024;
    memoryLeakBytes.set(bytes);
    console.log(`CHAOS: retained approximately ${Math.round(bytes / 1024 / 1024)} MiB`);
  }, 1000);
}

async function start() {
  await mongo.connect();
  await redis.ping();

  healthServer();
  startMemoryLeak();

  console.log("Worker started");
  console.log({
    memoryLeak: MEMORY_LEAK,
    hang: HANG
  });

  await consume();
}

start().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});
