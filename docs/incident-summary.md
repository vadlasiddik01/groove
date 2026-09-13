# Northwind Logistics — Incident Summary

## Incident 1: Worker crash during active processing

### What broke
A worker pod was intentionally terminated while the queue contained orders.

### Detection
Kubernetes observed that the Deployment had fewer available replicas than its desired state.

### Recovery
The Kubernetes Deployment controller created a replacement worker pod automatically. Redis retained queued orders, so the new worker continued consuming work.

### Result
No manual restart was required. The worker returned to service automatically.

### Lesson
Kubernetes self-healing handles hard process/pod failures well when workloads are managed by a Deployment and work is stored durably in a queue.

---

## Incident 2: Gradual worker memory leak

### What broke
The worker was run with the controlled `CHAOS_MEMORY_LEAK` mode. It retained approximately 1 MiB per second.

### Detection
The worker continued to answer health checks, so a simple liveness probe did not detect the degradation. Prometheus tracked `process_resident_memory_bytes`, and an alert used a derivative over a 10-minute window to detect sustained positive memory growth.

### Recovery
Prometheus fired `WorkerMemoryLeak`. Alertmanager delivered the alert to the remediation service. The remediation service used its restricted Kubernetes service account to delete worker pods. The Deployment controller created replacement pods.

### Result
The unhealthy worker was removed before a natural OOM failure. Processing continued after replacement.

### Lesson
Health checks and trend-based observability solve different problems. A service can be alive while steadily degrading.

---

## Production improvements

With a real cloud environment I would consider:
- managed Kubernetes such as EKS/AKS/GKE
- managed MongoDB or a production database with backups
- Redis HA / managed queue
- private container registry with image scanning and signing
- TLS everywhere
- workload identity instead of broad credentials
- PodDisruptionBudgets and topology spread
- resource requests/limits tuned from observed usage
- SLOs and error budgets
- centralized logs and distributed tracing
- multi-zone worker capacity
- stronger remediation idempotency and rate limiting
- canary/blue-green deployments
- secrets management
- alert routing/on-call integration
