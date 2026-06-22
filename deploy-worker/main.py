"""
LiteDock — Deploy Worker (automação em Python)
==============================================
Camada de automação de deploy do LiteDock, separada do control plane (Node).
O Node cuida do catálogo/loja e dos registros; este worker faz a parte "braçal":
puxar imagem, subir/parar/remover container, ler logs.

Modo seguro (SAFE_MODE=true, padrão): NÃO toca no Docker — retorna o "plano"
(dry-run) do que faria. Protege os containers existentes da VPS até liberar.
Para ligar de verdade: SAFE_MODE=false no ambiente.

Roda em loopback (127.0.0.1) — só o backend Node fala com ele.
"""
import os
import shlex
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SAFE_MODE = os.getenv("SAFE_MODE", "true").lower() != "false"
NETWORK = os.getenv("TRAEFIK_NETWORK", "litedock")
PREFIX = os.getenv("CONTAINER_PREFIX", "litedock")

app = FastAPI(title="LiteDock Deploy Worker", version="0.1.0")


# ── Modelos ──────────────────────────────────────────────────────────────
class ServiceSpec(BaseModel):
    name: str = Field(..., description="nome do serviço")
    image: str = Field(..., description="imagem Docker (ex.: wordpress:latest)")
    project: str = Field("default", description="slug do projeto")
    ports: list[int] = []
    volumes: list[str] = []
    env: dict[str, str] = {}


class TargetRef(BaseModel):
    container_id: str


# ── Helpers ──────────────────────────────────────────────────────────────
def container_name(project: str, name: str) -> str:
    return f"{PREFIX}-{project}-{name}"


def _docker():
    """Importa o SDK só quando vai usar de verdade (dry-run não precisa)."""
    try:
        import docker  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise HTTPException(503, "SDK docker não instalado no worker") from e
    try:
        return docker.from_env()
    except Exception as e:  # pragma: no cover
        raise HTTPException(503, f"sem acesso ao Docker: {e}") from e


def build_plan(spec: ServiceSpec) -> dict:
    name = container_name(spec.project, spec.name)
    ports = {f"{p}/tcp": None for p in spec.ports}  # None = porta dinâmica no host
    volumes = {
        f"{name}-{i}": {"bind": v, "mode": "rw"} for i, v in enumerate(spec.volumes)
    }
    cli = (
        f"docker run -d --name {name} --network {NETWORK} "
        + " ".join(f"-e {shlex.quote(k)}={shlex.quote(v)}" for k, v in spec.env.items())
        + " "
        + " ".join(f"-v {vol}:{m['bind']}" for vol, m in volumes.items())
        + f" {spec.image}"
    )
    return {
        "containerName": name,
        "image": spec.image,
        "network": NETWORK,
        "ports": spec.ports,
        "volumes": list(volumes.keys()),
        "envKeys": list(spec.env.keys()),
        "equivalentCli": " ".join(cli.split()),
    }


# ── Rotas ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"ok": True, "service": "litedock-deploy-worker", "safeMode": SAFE_MODE}


@app.post("/deploy")
def deploy(spec: ServiceSpec):
    plan = build_plan(spec)
    if SAFE_MODE:
        return {"dryRun": True, "status": "planned", "plan": plan}

    client = _docker()
    # garante a rede do Traefik
    try:
        client.networks.get(NETWORK)
    except Exception:
        client.networks.create(NETWORK, driver="bridge")

    client.images.pull(spec.image)

    name = plan["containerName"]
    # remove container antigo de mesmo nome, se houver
    try:
        old = client.containers.get(name)
        old.remove(force=True)
    except Exception:
        pass

    container = client.containers.run(
        spec.image,
        name=name,
        detach=True,
        environment=spec.env,
        ports={f"{p}/tcp": None for p in spec.ports},
        volumes={f"{name}-{i}": {"bind": v, "mode": "rw"} for i, v in enumerate(spec.volumes)},
        network=NETWORK,
        restart_policy={"Name": "unless-stopped"},
        labels={"litedock": "true", "litedock.project": spec.project, "litedock.service": spec.name},
    )
    return {"dryRun": False, "status": "running", "containerId": container.id, "plan": plan}


@app.post("/stop")
def stop(ref: TargetRef):
    if SAFE_MODE:
        return {"dryRun": True, "status": "would-stop", "containerId": ref.container_id}
    client = _docker()
    client.containers.get(ref.container_id).stop()
    return {"status": "stopped", "containerId": ref.container_id}


@app.post("/remove")
def remove(ref: TargetRef):
    if SAFE_MODE:
        return {"dryRun": True, "status": "would-remove", "containerId": ref.container_id}
    client = _docker()
    client.containers.get(ref.container_id).remove(force=True)
    return {"status": "removed", "containerId": ref.container_id}


@app.get("/logs")
def logs(container_id: str, tail: int = 200):
    if SAFE_MODE:
        return {"dryRun": True, "logs": "(modo seguro: logs reais desativados)"}
    client = _docker()
    out = client.containers.get(container_id).logs(tail=tail).decode("utf-8", "replace")
    return {"logs": out}
