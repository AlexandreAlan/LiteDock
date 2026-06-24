# Imagem builder efêmera do LiteDock.
# Junta o CLI do Nixpacks (buildpack que detecta a stack) com o CLI do Docker,
# pra rodar `nixpacks build` num container isolado falando com o Docker do host
# (via /var/run/docker.sock montado). Assim NENHUM host precisa ter o nixpacks
# instalado — a única dependência do painel volta a ser só o Docker.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -sSL https://nixpacks.com/install.sh | bash \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# CLI do Docker (binário estático Go) copiado da imagem oficial — sem precisar
# do repositório apt do Docker. O nixpacks chama esse `docker build` por baixo.
# O plugin buildx vai junto: o nixpacks usa BuildKit, que exige o buildx.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx

WORKDIR /app
ENTRYPOINT ["nixpacks"]
