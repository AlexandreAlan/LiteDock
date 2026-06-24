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
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

SAFE_MODE = os.getenv("SAFE_MODE", "true").lower() != "false"
NETWORK = os.getenv("TRAEFIK_NETWORK", "litedock")
PREFIX = os.getenv("CONTAINER_PREFIX", "litedock")

# Imagem builder efêmera (nixpacks CLI + docker CLI). Construída sob demanda a
# partir do Dockerfile em nixpacks-builder/. Assim o host NÃO precisa ter o
# nixpacks instalado — só o Docker.
BUILDER_IMAGE = os.getenv("NIXPACKS_BUILDER_IMAGE", "litedock/nixpacks-builder:latest")
BUILDER_DIR = str(Path(__file__).resolve().parent / "nixpacks-builder")

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


# ── Build de código com Nixpacks CONTEINERIZADO ─────────────────────────────
# O Node clona o repositório (num diretório temporário do host) e nos manda o
# caminho + a tag-alvo. Aqui rodamos o nixpacks DENTRO de um container efêmero
# que tem o CLI do nixpacks e do docker; montamos /var/run/docker.sock pra ele
# gerar a imagem no Docker Engine do host. Logs vão em streaming (linha a linha)
# pro Node repassar ao log do deploy. Sentinelas no fim sinalizam sucesso/falha.
OK_SENTINEL = "__LITEDOCK_NIXPACKS_OK__"
FAIL_SENTINEL = "__LITEDOCK_NIXPACKS_FAIL__"


class NixpacksBuild(BaseModel):
    context: str = Field(..., description="diretório do código no host (já clonado)")
    image_tag: str = Field(..., description="tag da imagem a gerar")


def _stream_cmd(cmd: list[str]):
    """Roda um comando e gera (yield) cada linha de saída combinada."""
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ""):
        yield line.rstrip("\n")
    proc.stdout.close()
    proc.wait()
    yield proc.returncode  # int no fim = código de saída


def _builder_image_exists() -> bool:
    out = subprocess.run(
        ["docker", "images", "-q", BUILDER_IMAGE],
        capture_output=True, text=True,
    )
    return bool(out.stdout.strip())


def _nixpacks_stream(ctx: str, image_tag: str):
    # 1) Garante a imagem builder (build sob demanda, na 1ª vez).
    if not _builder_image_exists():
        yield f"Builder ausente → construindo {BUILDER_IMAGE} (só na 1ª vez) ...\n"
        code = 0
        for item in _stream_cmd(["docker", "build", "-t", BUILDER_IMAGE, BUILDER_DIR]):
            if isinstance(item, int):
                code = item
            else:
                yield item + "\n"
        if code != 0:
            yield f"{FAIL_SENTINEL} build da imagem builder falhou ({code})\n"
            return

    # 2) Roda o nixpacks conteinerizado contra o sock do host.
    run_cmd = [
        "docker", "run", "--rm",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-v", f"{ctx}:/app",
        BUILDER_IMAGE,
        "build", "/app", "--name", image_tag,
    ]
    code = 0
    for item in _stream_cmd(run_cmd):
        if isinstance(item, int):
            code = item
        else:
            yield item + "\n"
    yield (OK_SENTINEL if code == 0 else f"{FAIL_SENTINEL} nixpacks saiu com {code}") + "\n"


@app.post("/build/nixpacks")
def build_nixpacks(body: NixpacksBuild):
    ctx = os.path.abspath(body.context)
    if not os.path.isdir(ctx):
        raise HTTPException(400, f"contexto não existe: {ctx}")
    if SAFE_MODE:
        plan = f"docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v {ctx}:/app {BUILDER_IMAGE} build /app --name {body.image_tag}"
        return {"dryRun": True, "status": "planned", "equivalentCli": plan}
    return StreamingResponse(_nixpacks_stream(ctx, body.image_tag), media_type="text/plain")


# ── Ações de sistema (operação do host) ────────────────────────────────────
# IMPORTANTE: esta VPS é compartilhada com várias apps de produção. Por isso
# NADA aqui faz prune global do Docker — só mexe em recursos órfãos (dangling)
# e em containers/redes com o prefixo/rótulo do LiteDock. Nunca toca nas
# imagens/volumes dos outros projetos.
TRAEFIK_CONTAINER = os.getenv("TRAEFIK_CONTAINER", "litedock-traefik")
PANEL_PM2_NAME = os.getenv("PANEL_PM2_NAME", "litedock-v2-api")


def _human(n: int) -> str:
    f = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if f < 1024 or unit == "TB":
            return f"{f:.1f} {unit}"
        f /= 1024
    return f"{f:.1f} TB"


@app.get("/system/df")
def system_df():
    """Uso de disco do Docker (read-only) — seguro."""
    client = _docker()
    df = client.df()
    images = df.get("Images", []) or []
    containers = df.get("Containers", []) or []
    volumes = df.get("Volumes", []) or []
    img_total = sum(i.get("Size", 0) for i in images)
    img_reclaim = sum(i.get("Size", 0) for i in images if (i.get("Containers", 0) or 0) == 0)
    vol_total = sum((v.get("UsageData") or {}).get("Size", 0) for v in volumes)
    return {
        "images": {"count": len(images), "size": img_total, "sizeHuman": _human(img_total),
                   "reclaimable": img_reclaim, "reclaimableHuman": _human(img_reclaim)},
        "containers": {"count": len(containers)},
        "volumes": {"count": len(volumes), "size": vol_total, "sizeHuman": _human(vol_total)},
    }


@app.post("/system/prune")
def system_prune():
    """Limpeza SEGURA: remove só imagens dangling (camadas órfãs sem tag) e
    containers parados do LiteDock. Não faz system prune nem remove imagens de
    outros projetos."""
    client = _docker()
    # 1) imagens dangling (órfãs) — seguro, ninguém usa
    img = client.images.prune(filters={"dangling": True})
    reclaimed = img.get("SpaceReclaimed", 0) or 0
    deleted_imgs = len(img.get("ImagesDeleted") or [])
    # 2) containers parados que são do LiteDock (prefixo)
    removed_containers = 0
    for c in client.containers.list(all=True, filters={"status": "exited"}):
        if c.name.startswith(PREFIX + "-"):
            try:
                c.remove()
                removed_containers += 1
            except Exception:
                pass
    return {
        "status": "ok",
        "imagesDeleted": deleted_imgs,
        "containersRemoved": removed_containers,
        "spaceReclaimed": reclaimed,
        "spaceReclaimedHuman": _human(reclaimed),
    }


@app.post("/system/traefik/restart")
def traefik_restart():
    client = _docker()
    try:
        c = client.containers.get(TRAEFIK_CONTAINER)
    except Exception as e:
        raise HTTPException(404, f"container do Traefik '{TRAEFIK_CONTAINER}' não encontrado") from e
    c.restart()
    return {"status": "restarted", "container": TRAEFIK_CONTAINER}


@app.get("/system/traefik/logs")
def traefik_logs(tail: int = 200):
    client = _docker()
    try:
        c = client.containers.get(TRAEFIK_CONTAINER)
    except Exception as e:
        raise HTTPException(404, f"container do Traefik '{TRAEFIK_CONTAINER}' não encontrado") from e
    return {"logs": c.logs(tail=tail).decode("utf-8", "replace")}


@app.post("/system/panel/restart")
def panel_restart():
    """Reinicia o painel (processo pm2). Roda em background com um pequeno
    atraso pra esta resposta conseguir voltar antes do Node cair."""
    import subprocess
    subprocess.Popen(
        ["bash", "-lc", f"sleep 1; pm2 restart {shlex.quote(PANEL_PM2_NAME)} --update-env"],
        start_new_session=True,
    )
    return {"status": "restarting", "process": PANEL_PM2_NAME}


# ── Redes: ISOLAMENTO por projeto + PONTES opt-in (automação em Python) ──────
# Modelo: cada projeto tem sua própria rede Docker `litedock-net-<slug>`.
# Os serviços de um projeto entram só nessa rede → conversam entre si, mas NÃO
# enxergam os de outro projeto (redes separadas). O Traefik é plugado em todas
# as redes de projeto (só pra rotear ingress HTTP — não deixa um container
# falar com o de outro projeto). Para dois projetos conversarem, cria-se uma
# PONTE: os containers de cada lado entram também na rede do outro.
def project_network(slug: str) -> str:
    return f"litedock-net-{slug}"


def _ensure_network(client, name: str, project: str | None = None):
    try:
        return client.networks.get(name)
    except Exception:
        labels = {"litedock.managed": "true"}
        if project:
            labels["litedock.project"] = project
        return client.networks.create(name, driver="bridge", labels=labels)


def _connect(net, container, ignore_missing=True):
    try:
        net.connect(container)
        return True
    except Exception as e:
        msg = str(e).lower()
        if "already exists" in msg or "already connected" in msg:
            return False
        if ignore_missing and ("not found" in msg or "no such" in msg):
            return False
        raise


def _disconnect(net, container):
    try:
        net.disconnect(container, force=True)
        return True
    except Exception:
        return False


def _project_containers(client, slug: str):
    prefix = f"{PREFIX}-{slug}-"
    return [c for c in client.containers.list(all=True) if c.name.startswith(prefix)]


class EnsureNet(BaseModel):
    project: str


@app.post("/network/ensure")
def network_ensure(body: EnsureNet):
    """Garante a rede do projeto e pluga o Traefik nela (idempotente)."""
    client = _docker()
    name = project_network(body.project)
    net = _ensure_network(client, name, body.project)
    try:
        traefik = client.containers.get(TRAEFIK_CONTAINER)
        _connect(net, traefik)
    except Exception:
        pass  # sem Traefik ainda — segue, o roteamento liga quando ele existir
    return {"network": name}


class ConnRef(BaseModel):
    container: str
    network: str


@app.post("/network/connect")
def network_connect(ref: ConnRef):
    client = _docker()
    net = _ensure_network(client, ref.network)
    _connect(net, ref.container)
    return {"status": "connected", "container": ref.container, "network": ref.network}


@app.post("/network/disconnect")
def network_disconnect(ref: ConnRef):
    client = _docker()
    try:
        net = client.networks.get(ref.network)
    except Exception:
        return {"status": "noop"}
    _disconnect(net, ref.container)
    return {"status": "disconnected", "container": ref.container, "network": ref.network}


class BridgeRef(BaseModel):
    projectA: str
    projectB: str
    connected: bool = True


@app.post("/network/bridge")
def network_bridge(body: BridgeRef):
    """Liga/desliga a ponte entre dois projetos: cada lado entra (ou sai) da
    rede do outro. Afeta os containers que JÁ existem; novos deploys já sobem
    conectados às pontes ativas (o Node passa as redes na criação)."""
    client = _docker()
    a, b = body.projectA, body.projectB
    net_a = _ensure_network(client, project_network(a), a)
    net_b = _ensure_network(client, project_network(b), b)
    changed = 0
    for c in _project_containers(client, a):
        if body.connected:
            if _connect(net_b, c):
                changed += 1
        else:
            if _disconnect(net_b, c):
                changed += 1
    for c in _project_containers(client, b):
        if body.connected:
            if _connect(net_a, c):
                changed += 1
        else:
            if _disconnect(net_a, c):
                changed += 1
    return {"status": "ok", "bridged": body.connected, "containersChanged": changed}
