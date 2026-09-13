import express from "express";
import * as k8s from "@kubernetes/client-node";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";

const PORT = Number(process.env.PORT ?? 3002);
const NAMESPACE = process.env.TARGET_NAMESPACE ?? "northwind";
const WORKER_LABEL = process.env.WORKER_LABEL ?? "app=worker";

const app = express();
app.use(express.json({ limit: "1mb" }));

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const remediationActions = new Counter({
  name: "remediation_actions_total",
  help: "Total automated remediation actions",
  labelNames: ["action", "reason"],
  registers: [registry]
});

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const coreApi = kc.makeApiClient(k8s.CoreV1Api);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "remediation" });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

app.post("/alerts", async (req, res) => {
  const payload = req.body;
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];

  for (const alert of alerts) {
    const name = alert?.labels?.alertname;
    const status = alert?.status;

    if (status !== "firing" || name !== "WorkerMemoryLeak") {
      continue;
    }

    console.log("WorkerMemoryLeak alert received; restarting worker pods");

    const response = await coreApi.listNamespacedPod({
      namespace: NAMESPACE,
      labelSelector: WORKER_LABEL
    });

    for (const pod of response.items) {
      const podName = pod.metadata?.name;
      if (!podName) continue;

      await coreApi.deleteNamespacedPod({
        name: podName,
        namespace: NAMESPACE
      });

      remediationActions.inc({
        action: "delete_worker_pod",
        reason: "WorkerMemoryLeak"
      });

      console.log(`Deleted worker pod ${podName}`);
    }
  }

  res.status(202).json({ accepted: true });
});

app.listen(PORT, () => {
  console.log(`Remediation service listening on ${PORT}`);
});
