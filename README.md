# Northwind Logistics — Self-Healing GitOps POC

A local DevOps/SRE proof-of-concept for an order-processing platform:

API -> Redis queue -> Worker -> MongoDB

Operational stack:
- Docker multi-stage images, non-root users
- k3d local Kubernetes
- Helm
- Argo CD GitOps
- Prometheus + Grafana + Alertmanager
- KEDA queue-based autoscaling
- Node.js/TypeScript remediation service
- Chaos scenarios: worker crash and gradual memory leak

## Architecture

```text
                    Local Git (Gitea)
                           |
                           v
                        Argo CD
                           |
                           v
                         k3d
        +------------------+------------------+
        |                  |                  |
       API               Worker            MongoDB
        |                  ^
        v                  |
      Redis --------------+
        |
        +--> KEDA scales Worker replicas from queue depth

Worker/API -> Prometheus -> Alertmanager -> remediation service
                                           |
                                           v
                                   Kubernetes API
                                           |
                                           v
                                      Worker pod
```

## Prerequisites

- Docker
- Node.js 22+
- npm
- kubectl
- helm
- k3d
- git
- curl

Recommended local resources: 8 GB RAM minimum; 12 GB+ is more comfortable.

## 1. Start local Git server

This POC uses Gitea as a local Git server so Argo CD can pull a repository that lives entirely on your machine.

```bash
docker compose -f gitea-compose.yml up -d
```

Open http://localhost:3000 and finish the Gitea first-run setup if shown.

Create a local repository named `northwind-logistics`.

Then add it as the remote for this project and push:

```bash
git remote add origin http://localhost:3000/<YOUR_GITEA_USER>/northwind-logistics.git
git push -u origin main
```

## 2. Create the k3d cluster

```bash
./scripts/create-cluster.sh
```

This creates:
- k3d cluster `northwind`
- local registry on localhost:5111
- namespace `northwind`

## 3. Install platform add-ons

```bash
./scripts/bootstrap-platform.sh
```

This bootstraps Argo CD, KEDA and kube-prometheus-stack. These are platform/bootstrap components; application changes are delivered through GitOps.

## 4. Build and push images

```bash
./scripts/build-images.sh
```

The images are tagged `:dev` and pushed to the local k3d registry.

## 5. Connect Argo CD to local Gitea

The easiest path for a local demo is:

```bash
./scripts/configure-argocd.sh
```

The script reads `GITEA_USER` and `GITEA_PASSWORD` from your shell environment.

Example:

```bash
export GITEA_USER=youruser
export GITEA_PASSWORD=yourpassword
./scripts/configure-argocd.sh
```

## 6. Deploy

```bash
./scripts/apply-argocd.sh
```

From this point, application changes should be:
1. edit Git
2. commit
3. push
4. let Argo CD sync

Avoid normal `kubectl apply` for application manifests.

## 7. Access the application

The API is exposed through a NodePort:

```bash
curl http://localhost:30080/health
```

Create an order:

```bash
curl -X POST http://localhost:30080/orders \
  -H 'content-type: application/json' \
  -d '{"product":"Laptop","quantity":2}'
```

Check:

```bash
curl http://localhost:30080/orders/count
curl http://localhost:30080/metrics
```

## 8. Useful commands

```bash
kubectl -n northwind get pods
kubectl -n northwind get deploy
kubectl -n northwind get scaledobject
kubectl -n northwind get pods -w
kubectl -n northwind logs deploy/worker
kubectl -n northwind logs deploy/remediation
```
## Chaos scenario A — worker crash

Generate some load:

```bash
./scripts/load-test.sh 100
```

Then kill a worker pod:

```bash
./scripts/chaos-crash.sh
```

Watch:

```bash
kubectl -n northwind get pods -w
```

Expected:
- worker pod terminates
- Deployment notices desired replicas are not met
- replacement pod is created
- Redis retains unprocessed orders
- processing continues

## Chaos scenario B — gradual memory leak

Patch the Git-controlled Helm values:

```yaml
worker:
  chaos:
    memoryLeak: true
```

Commit and push. Argo CD deploys the change.

The worker allocates a small amount of memory repeatedly and exposes its RSS through Prometheus.

The alert uses a trend rather than only a static threshold.

Expected flow:

```text
Worker RSS increases
 -> Prometheus observes trend
 -> WorkerMemoryLeak alert fires
 -> Alertmanager webhook
 -> remediation service
 -> worker pod deleted
 -> Deployment creates replacement
 -> memory returns to normal
```

To turn it off, change the same Git value back to false, commit and push.

## Chaos scenario C — worker hang

Set:

```yaml
worker:
  chaos:
    hang: true
```

Argo CD syncs it. The worker's health endpoint stops responding, so Kubernetes liveness checking restarts the container.

This is useful to explain why liveness is good for a hard hang but insufficient for a slow memory leak.

## Incident summary

See `docs/incident-summary.md`.

## Important GitOps rule

Do not manually edit application Deployments with `kubectl edit` or `kubectl scale`.
For desired-state changes, edit Helm values/templates in Git and push.

The remediation service is intentionally different: it performs an ephemeral recovery action (deleting a failed worker pod). It does not mutate the Git-defined Deployment spec.
