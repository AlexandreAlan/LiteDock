// Catálogo de templates (apps prontos), estilo "loja" do EasyPanel.
// Cada template cria um ou mais serviços com imagem, portas, env e volumes.
// Logos = logotipo OFICIAL de cada ferramenta (CDN dashboard-icons); o front
// cai pra inicial se a imagem faltar. Nada de emoji em ferramenta profissional.
import { randomBytes } from 'node:crypto';

export interface TemplateService {
  name: string; // sufixo do serviço (final = <slug>-<name> ou <slug>)
  type: 'app' | 'database';
  image: string;
  ports?: number[];
  env?: Record<string, string>; // valores podem referenciar ${VAR}
  volumes?: string[];
}

export interface Template {
  slug: string;
  name: string;
  description: string;
  category: string;
  logo: string; // URL do logotipo oficial
  website?: string;
  variables?: string[]; // gerados como senha forte por instalação
  services: TemplateService[];
}

// Logotipo oficial via CDN (jsDelivr → homarr-labs/dashboard-icons).
const ic = (name: string) => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${name}.png`;

export const CATEGORIES = [
  'Banco de dados',
  'CMS & Blog',
  'Automação & No-code',
  'Analytics & BI',
  'Monitoramento',
  'Dev & Git',
  'Segurança & Senhas',
  'Comunicação',
  'Produtividade & Cloud',
  'Mídia',
  'Ferramentas',
] as const;

// helpers de montagem
const app = (image: string, ports: number[], volumes: string[] = [], env?: Record<string, string>): TemplateService =>
  ({ name: 'app', type: 'app', image, ports, volumes, ...(env ? { env } : {}) });
const db = (image: string, ports: number[], volumes: string[], env?: Record<string, string>): TemplateService =>
  ({ name: 'db', type: 'database', image, ports, volumes, ...(env ? { env } : {}) });

export const TEMPLATES: Template[] = [
  // ── Banco de dados ──────────────────────────────────────────
  { slug: 'postgres', name: 'PostgreSQL', description: 'Banco relacional poderoso e open-source.', category: 'Banco de dados', logo: ic('postgresql'), website: 'https://www.postgresql.org', variables: ['DB_PASSWORD'], services: [db('postgres:16', [5432], ['/var/lib/postgresql/data'], { POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: '${DB_PASSWORD}', POSTGRES_DB: 'app' })] },
  { slug: 'mysql', name: 'MySQL', description: 'Banco relacional mais popular do mundo.', category: 'Banco de dados', logo: ic('mysql'), website: 'https://www.mysql.com', variables: ['DB_PASSWORD'], services: [db('mysql:8', [3306], ['/var/lib/mysql'], { MYSQL_ROOT_PASSWORD: '${DB_PASSWORD}', MYSQL_DATABASE: 'app' })] },
  { slug: 'mariadb', name: 'MariaDB', description: 'Fork do MySQL, comunidade-driven.', category: 'Banco de dados', logo: ic('mariadb'), website: 'https://mariadb.org', variables: ['DB_PASSWORD'], services: [db('mariadb:11', [3306], ['/var/lib/mysql'], { MARIADB_ROOT_PASSWORD: '${DB_PASSWORD}', MARIADB_DATABASE: 'app' })] },
  { slug: 'mongodb', name: 'MongoDB', description: 'Banco de documentos NoSQL.', category: 'Banco de dados', logo: ic('mongodb'), website: 'https://www.mongodb.com', variables: ['DB_PASSWORD'], services: [db('mongo:7', [27017], ['/data/db'], { MONGO_INITDB_ROOT_USERNAME: 'root', MONGO_INITDB_ROOT_PASSWORD: '${DB_PASSWORD}' })] },
  { slug: 'redis', name: 'Redis', description: 'Cache e store chave-valor em memória.', category: 'Banco de dados', logo: ic('redis'), website: 'https://redis.io', services: [db('redis:7', [6379], ['/data'])] },
  { slug: 'couchdb', name: 'CouchDB', description: 'Banco de documentos com sync.', category: 'Banco de dados', logo: ic('couchdb'), website: 'https://couchdb.apache.org', variables: ['DB_PASSWORD'], services: [db('couchdb:3', [5984], ['/opt/couchdb/data'], { COUCHDB_USER: 'admin', COUCHDB_PASSWORD: '${DB_PASSWORD}' })] },
  { slug: 'influxdb', name: 'InfluxDB', description: 'Banco de séries temporais.', category: 'Banco de dados', logo: ic('influxdb'), website: 'https://www.influxdata.com', services: [db('influxdb:2', [8086], ['/var/lib/influxdb2'])] },
  { slug: 'clickhouse', name: 'ClickHouse', description: 'Banco colunar para analytics rápido.', category: 'Banco de dados', logo: ic('clickhouse'), website: 'https://clickhouse.com', services: [db('clickhouse/clickhouse-server:latest', [8123, 9000], ['/var/lib/clickhouse'])] },
  { slug: 'neo4j', name: 'Neo4j', description: 'Banco de grafos.', category: 'Banco de dados', logo: ic('neo4j'), website: 'https://neo4j.com', services: [db('neo4j:5', [7474, 7687], ['/data'])] },
  { slug: 'surrealdb', name: 'SurrealDB', description: 'Banco multi-modelo moderno.', category: 'Banco de dados', logo: ic('surrealdb'), website: 'https://surrealdb.com', services: [db('surrealdb/surrealdb:latest', [8000], ['/data'])] },
  { slug: 'pgadmin', name: 'pgAdmin', description: 'Administração web do PostgreSQL.', category: 'Banco de dados', logo: ic('pgadmin'), website: 'https://www.pgadmin.org', variables: ['ADMIN_PASSWORD'], services: [app('dpage/pgadmin4:latest', [80], ['/var/lib/pgadmin'], { PGADMIN_DEFAULT_EMAIL: 'admin@litedock.app', PGADMIN_DEFAULT_PASSWORD: '${ADMIN_PASSWORD}' })] },
  { slug: 'adminer', name: 'Adminer', description: 'Admin de banco em um único arquivo.', category: 'Banco de dados', logo: ic('adminer'), website: 'https://www.adminer.org', services: [app('adminer:latest', [8080])] },
  { slug: 'phpmyadmin', name: 'phpMyAdmin', description: 'Administração web do MySQL/MariaDB.', category: 'Banco de dados', logo: ic('phpmyadmin'), website: 'https://www.phpmyadmin.net', services: [app('phpmyadmin:latest', [80])] },
  { slug: 'mongo-express', name: 'Mongo Express', description: 'Admin web do MongoDB.', category: 'Banco de dados', logo: ic('mongodb'), website: 'https://github.com/mongo-express/mongo-express', services: [app('mongo-express:latest', [8081])] },
  { slug: 'redisinsight', name: 'RedisInsight', description: 'Interface visual para Redis.', category: 'Banco de dados', logo: ic('redis'), website: 'https://redis.io/insight', services: [app('redis/redisinsight:latest', [5540], ['/data'])] },

  // ── CMS & Blog ──────────────────────────────────────────────
  { slug: 'wordpress', name: 'WordPress', description: 'O CMS mais usado do mundo (site/blog).', category: 'CMS & Blog', logo: ic('wordpress'), website: 'https://wordpress.org', variables: ['DB_PASSWORD'], services: [app('wordpress:6', [80], ['/var/www/html'], { WORDPRESS_DB_HOST: '${slug}-db', WORDPRESS_DB_USER: 'wp', WORDPRESS_DB_PASSWORD: '${DB_PASSWORD}', WORDPRESS_DB_NAME: 'wp' }), db('mariadb:11', [3306], ['/var/lib/mysql'], { MARIADB_DATABASE: 'wp', MARIADB_USER: 'wp', MARIADB_PASSWORD: '${DB_PASSWORD}', MARIADB_ROOT_PASSWORD: '${DB_PASSWORD}' })] },
  { slug: 'ghost', name: 'Ghost', description: 'Plataforma de publicação e newsletter.', category: 'CMS & Blog', logo: ic('ghost'), website: 'https://ghost.org', services: [app('ghost:5', [2368], ['/var/lib/ghost/content'], { url: 'http://localhost:2368' })] },
  { slug: 'directus', name: 'Directus', description: 'Headless CMS sobre seu banco.', category: 'CMS & Blog', logo: ic('directus'), website: 'https://directus.io', variables: ['ADMIN_PASSWORD', 'SECRET'], services: [app('directus/directus:latest', [8055], ['/directus/uploads'], { ADMIN_EMAIL: 'admin@litedock.app', ADMIN_PASSWORD: '${ADMIN_PASSWORD}', SECRET: '${SECRET}' })] },
  { slug: 'strapi', name: 'Strapi', description: 'Headless CMS líder em Node.js.', category: 'CMS & Blog', logo: ic('strapi'), website: 'https://strapi.io', services: [app('strapi/strapi:latest', [1337], ['/srv/app'])] },
  { slug: 'drupal', name: 'Drupal', description: 'CMS robusto para sites complexos.', category: 'CMS & Blog', logo: ic('drupal'), website: 'https://www.drupal.org', services: [app('drupal:10', [80], ['/var/www/html/sites'])] },
  { slug: 'joomla', name: 'Joomla', description: 'CMS clássico e flexível.', category: 'CMS & Blog', logo: ic('joomla'), website: 'https://www.joomla.org', services: [app('joomla:latest', [80], ['/var/www/html'])] },
  { slug: 'wikijs', name: 'Wiki.js', description: 'Wiki moderno e bonito.', category: 'CMS & Blog', logo: ic('wikijs'), website: 'https://js.wiki', services: [app('requarks/wiki:2', [3000], ['/wiki/data'])] },
  { slug: 'bookstack', name: 'BookStack', description: 'Wiki/documentação organizada em livros.', category: 'CMS & Blog', logo: ic('bookstack'), website: 'https://www.bookstackapp.com', services: [app('lscr.io/linuxserver/bookstack:latest', [80], ['/config'])] },
  { slug: 'outline', name: 'Outline', description: 'Base de conhecimento da equipe.', category: 'CMS & Blog', logo: ic('outline'), website: 'https://www.getoutline.com', services: [app('outlinewiki/outline:latest', [3000], ['/var/lib/outline/data'])] },

  // ── Automação & No-code ─────────────────────────────────────
  { slug: 'n8n', name: 'n8n', description: 'Automação de fluxos (alternativa ao Zapier).', category: 'Automação & No-code', logo: ic('n8n'), website: 'https://n8n.io', services: [app('n8nio/n8n:latest', [5678], ['/home/node/.n8n'])] },
  { slug: 'node-red', name: 'Node-RED', description: 'Programação visual por fluxos.', category: 'Automação & No-code', logo: ic('node-red'), website: 'https://nodered.org', services: [app('nodered/node-red:latest', [1880], ['/data'])] },
  { slug: 'activepieces', name: 'Activepieces', description: 'Automação open-source no-code.', category: 'Automação & No-code', logo: ic('activepieces'), website: 'https://www.activepieces.com', services: [app('activepieces/activepieces:latest', [80], ['/root/.activepieces'])] },
  { slug: 'huginn', name: 'Huginn', description: 'Agentes que monitoram e agem por você.', category: 'Automação & No-code', logo: ic('huginn'), website: 'https://github.com/huginn/huginn', services: [app('ghcr.io/huginn/huginn:latest', [3000], [])] },
  { slug: 'appsmith', name: 'Appsmith', description: 'Construa apps internos sobre seus dados.', category: 'Automação & No-code', logo: ic('appsmith'), website: 'https://www.appsmith.com', services: [app('appsmith/appsmith-ce:latest', [80], ['/appsmith-stacks'])] },
  { slug: 'nocodb', name: 'NocoDB', description: 'Transforma banco em planilha (Airtable).', category: 'Automação & No-code', logo: ic('nocodb'), website: 'https://nocodb.com', services: [app('nocodb/nocodb:latest', [8080], ['/usr/app/data'])] },
  { slug: 'baserow', name: 'Baserow', description: 'Banco no-code estilo Airtable.', category: 'Automação & No-code', logo: ic('baserow'), website: 'https://baserow.io', services: [app('baserow/baserow:latest', [80], ['/baserow/data'])] },
  { slug: 'pocketbase', name: 'PocketBase', description: 'Backend num arquivo (DB + auth + API).', category: 'Automação & No-code', logo: ic('pocketbase'), website: 'https://pocketbase.io', services: [app('ghcr.io/muchobien/pocketbase:latest', [8090], ['/pb_data'])] },

  // ── Analytics & BI ──────────────────────────────────────────
  { slug: 'metabase', name: 'Metabase', description: 'BI e dashboards simples.', category: 'Analytics & BI', logo: ic('metabase'), website: 'https://www.metabase.com', services: [app('metabase/metabase:latest', [3000], ['/metabase-data'])] },
  { slug: 'umami', name: 'Umami', description: 'Analytics de site leve e privado.', category: 'Analytics & BI', logo: ic('umami'), website: 'https://umami.is', variables: ['DB_PASSWORD', 'APP_SECRET'], services: [app('ghcr.io/umami-software/umami:postgresql-latest', [3000], [], { DATABASE_URL: 'postgresql://umami:${DB_PASSWORD}@${slug}-db:5432/umami', DATABASE_TYPE: 'postgresql', APP_SECRET: '${APP_SECRET}' }), db('postgres:16', [5432], ['/var/lib/postgresql/data'], { POSTGRES_USER: 'umami', POSTGRES_PASSWORD: '${DB_PASSWORD}', POSTGRES_DB: 'umami' })] },
  { slug: 'matomo', name: 'Matomo', description: 'Analytics web (alternativa ao GA).', category: 'Analytics & BI', logo: ic('matomo'), website: 'https://matomo.org', variables: ['DB_PASSWORD'], services: [app('matomo:latest', [80], ['/var/www/html'], { MATOMO_DATABASE_HOST: '${slug}-db', MATOMO_DATABASE_USERNAME: 'matomo', MATOMO_DATABASE_PASSWORD: '${DB_PASSWORD}', MATOMO_DATABASE_DBNAME: 'matomo' }), db('mariadb:11', [3306], ['/var/lib/mysql'], { MARIADB_DATABASE: 'matomo', MARIADB_USER: 'matomo', MARIADB_PASSWORD: '${DB_PASSWORD}', MARIADB_ROOT_PASSWORD: '${DB_PASSWORD}' })] },
  { slug: 'grafana', name: 'Grafana', description: 'Dashboards e visualização de métricas.', category: 'Analytics & BI', logo: ic('grafana'), website: 'https://grafana.com', services: [app('grafana/grafana:latest', [3000], ['/var/lib/grafana'])] },
  { slug: 'plausible', name: 'Plausible', description: 'Analytics web simples e sem cookies.', category: 'Analytics & BI', logo: ic('plausible'), website: 'https://plausible.io', services: [app('ghcr.io/plausible/community-edition:latest', [8000], [])] },

  // ── Monitoramento ───────────────────────────────────────────
  { slug: 'uptime-kuma', name: 'Uptime Kuma', description: 'Monitor de uptime self-hosted.', category: 'Monitoramento', logo: ic('uptime-kuma'), website: 'https://github.com/louislam/uptime-kuma', services: [app('louislam/uptime-kuma:1', [3001], ['/app/data'])] },
  { slug: 'prometheus', name: 'Prometheus', description: 'Coleta e alerta de métricas.', category: 'Monitoramento', logo: ic('prometheus'), website: 'https://prometheus.io', services: [app('prom/prometheus:latest', [9090], ['/prometheus'])] },
  { slug: 'netdata', name: 'Netdata', description: 'Monitor em tempo real do servidor.', category: 'Monitoramento', logo: ic('netdata'), website: 'https://www.netdata.cloud', services: [app('netdata/netdata:latest', [19999], ['/var/lib/netdata'])] },
  { slug: 'dozzle', name: 'Dozzle', description: 'Logs de containers no navegador.', category: 'Monitoramento', logo: ic('dozzle'), website: 'https://dozzle.dev', services: [app('amir20/dozzle:latest', [8080])] },
  { slug: 'portainer', name: 'Portainer', description: 'Gerência de Docker pela web.', category: 'Monitoramento', logo: ic('portainer'), website: 'https://www.portainer.io', services: [app('portainer/portainer-ce:latest', [9000], ['/data'])] },
  { slug: 'glances', name: 'Glances', description: 'Monitor de sistema multiplataforma.', category: 'Monitoramento', logo: ic('glances'), website: 'https://nicolargo.github.io/glances', services: [app('nicolargo/glances:latest', [61208])] },
  { slug: 'grafana-loki', name: 'Grafana Loki', description: 'Agregação de logs.', category: 'Monitoramento', logo: ic('loki'), website: 'https://grafana.com/oss/loki', services: [app('grafana/loki:latest', [3100], ['/loki'])] },
  { slug: 'gotify', name: 'Gotify', description: 'Servidor de notificações push.', category: 'Monitoramento', logo: ic('gotify'), website: 'https://gotify.net', services: [app('gotify/server:latest', [80], ['/app/data'])] },
  { slug: 'ntfy', name: 'ntfy', description: 'Notificações push via HTTP.', category: 'Monitoramento', logo: ic('ntfy'), website: 'https://ntfy.sh', services: [app('binwiederhier/ntfy:latest', [80], ['/var/cache/ntfy'])] },

  // ── Dev & Git ───────────────────────────────────────────────
  { slug: 'gitea', name: 'Gitea', description: 'Git self-hosted leve.', category: 'Dev & Git', logo: ic('gitea'), website: 'https://gitea.io', services: [app('gitea/gitea:latest', [3000, 22], ['/data'])] },
  { slug: 'forgejo', name: 'Forgejo', description: 'Fork comunitário do Gitea.', category: 'Dev & Git', logo: ic('forgejo'), website: 'https://forgejo.org', services: [app('codeberg.org/forgejo/forgejo:7', [3000, 22], ['/data'])] },
  { slug: 'code-server', name: 'code-server', description: 'VS Code no navegador.', category: 'Dev & Git', logo: ic('vscode'), website: 'https://github.com/coder/code-server', services: [app('codercom/code-server:latest', [8080], ['/home/coder'])] },
  { slug: 'verdaccio', name: 'Verdaccio', description: 'Registro NPM privado.', category: 'Dev & Git', logo: ic('verdaccio'), website: 'https://verdaccio.org', services: [app('verdaccio/verdaccio:latest', [4873], ['/verdaccio/storage'])] },
  { slug: 'registry', name: 'Docker Registry', description: 'Registro de imagens Docker privado.', category: 'Dev & Git', logo: ic('docker'), website: 'https://docs.docker.com/registry', services: [app('registry:2', [5000], ['/var/lib/registry'])] },
  { slug: 'sonarqube', name: 'SonarQube', description: 'Análise de qualidade de código.', category: 'Dev & Git', logo: ic('sonarqube'), website: 'https://www.sonarsource.com', services: [app('sonarqube:community', [9000], ['/opt/sonarqube/data'])] },
  { slug: 'woodpecker', name: 'Woodpecker CI', description: 'CI/CD simples baseado em containers.', category: 'Dev & Git', logo: ic('woodpecker-ci'), website: 'https://woodpecker-ci.org', services: [app('woodpeckerci/woodpecker-server:latest', [8000], ['/var/lib/woodpecker'])] },
  { slug: 'drone', name: 'Drone CI', description: 'Pipeline de CI/CD container-native.', category: 'Dev & Git', logo: ic('drone'), website: 'https://www.drone.io', services: [app('drone/drone:latest', [80], ['/data'])] },

  // ── Segurança & Senhas ──────────────────────────────────────
  { slug: 'vaultwarden', name: 'Vaultwarden', description: 'Servidor compatível com Bitwarden.', category: 'Segurança & Senhas', logo: ic('vaultwarden'), website: 'https://github.com/dani-garcia/vaultwarden', services: [app('vaultwarden/server:latest', [80], ['/data'])] },
  { slug: 'keycloak', name: 'Keycloak', description: 'Identidade e SSO (OIDC/SAML).', category: 'Segurança & Senhas', logo: ic('keycloak'), website: 'https://www.keycloak.org', variables: ['ADMIN_PASSWORD'], services: [app('quay.io/keycloak/keycloak:latest', [8080], ['/opt/keycloak/data'], { KEYCLOAK_ADMIN: 'admin', KEYCLOAK_ADMIN_PASSWORD: '${ADMIN_PASSWORD}', KC_HTTP_ENABLED: 'true', KC_PROXY: 'edge' })] },
  { slug: 'authelia', name: 'Authelia', description: 'Autenticação 2FA/SSO para seus apps.', category: 'Segurança & Senhas', logo: ic('authelia'), website: 'https://www.authelia.com', services: [app('authelia/authelia:latest', [9091], ['/config'])] },
  { slug: 'authentik', name: 'Authentik', description: 'Provedor de identidade flexível.', category: 'Segurança & Senhas', logo: ic('authentik'), website: 'https://goauthentik.io', services: [app('ghcr.io/goauthentik/server:latest', [9000], ['/media'])] },
  { slug: 'vault', name: 'HashiCorp Vault', description: 'Cofre de segredos.', category: 'Segurança & Senhas', logo: ic('vault'), website: 'https://www.vaultproject.io', services: [app('hashicorp/vault:latest', [8200], ['/vault/data'])] },
  { slug: 'infisical', name: 'Infisical', description: 'Gestão de segredos para times.', category: 'Segurança & Senhas', logo: ic('infisical'), website: 'https://infisical.com', services: [app('infisical/infisical:latest', [8080], [])] },

  // ── Comunicação ─────────────────────────────────────────────
  { slug: 'rocketchat', name: 'Rocket.Chat', description: 'Chat de equipe (alternativa ao Slack).', category: 'Comunicação', logo: ic('rocket-chat'), website: 'https://rocket.chat', services: [app('rocket.chat:latest', [3000], [], { MONGO_URL: 'mongodb://${slug}-db:27017/rocketchat', ROOT_URL: 'http://localhost:3000' }), db('mongo:6', [27017], ['/data/db'])] },
  { slug: 'mattermost', name: 'Mattermost', description: 'Colaboração de times self-hosted.', category: 'Comunicação', logo: ic('mattermost'), website: 'https://mattermost.com', variables: ['DB_PASSWORD'], services: [app('mattermost/mattermost-team-edition:latest', [8065], ['/mattermost/data'], { MM_SQLSETTINGS_DRIVERNAME: 'postgres', MM_SQLSETTINGS_DATASOURCE: 'postgres://mm:${DB_PASSWORD}@${slug}-db:5432/mm?sslmode=disable' }), db('postgres:16', [5432], ['/var/lib/postgresql/data'], { POSTGRES_USER: 'mm', POSTGRES_PASSWORD: '${DB_PASSWORD}', POSTGRES_DB: 'mm' })] },
  { slug: 'matrix-synapse', name: 'Matrix Synapse', description: 'Servidor de mensageria federada.', category: 'Comunicação', logo: ic('matrix'), website: 'https://matrix.org', services: [app('matrixdotorg/synapse:latest', [8008], ['/data'])] },
  { slug: 'mailcow', name: 'Roundcube', description: 'Webmail leve e clássico.', category: 'Comunicação', logo: ic('roundcube'), website: 'https://roundcube.net', services: [app('roundcube/roundcubemail:latest', [80], ['/var/www/html'])] },
  { slug: 'jitsi', name: 'Jitsi Meet', description: 'Videoconferência open-source.', category: 'Comunicação', logo: ic('jitsi-meet'), website: 'https://jitsi.org', services: [app('jitsi/web:latest', [80], [])] },

  // ── Produtividade & Cloud ───────────────────────────────────
  { slug: 'nextcloud', name: 'Nextcloud', description: 'Sua nuvem privada (arquivos, fotos, apps).', category: 'Produtividade & Cloud', logo: ic('nextcloud'), website: 'https://nextcloud.com', variables: ['DB_PASSWORD'], services: [app('nextcloud:latest', [80], ['/var/www/html'], { POSTGRES_HOST: '${slug}-db', POSTGRES_DB: 'nextcloud', POSTGRES_USER: 'nextcloud', POSTGRES_PASSWORD: '${DB_PASSWORD}' }), db('postgres:16', [5432], ['/var/lib/postgresql/data'], { POSTGRES_DB: 'nextcloud', POSTGRES_USER: 'nextcloud', POSTGRES_PASSWORD: '${DB_PASSWORD}' })] },
  { slug: 'filebrowser', name: 'File Browser', description: 'Gerenciador de arquivos web.', category: 'Produtividade & Cloud', logo: ic('filebrowser'), website: 'https://filebrowser.org', services: [app('filebrowser/filebrowser:latest', [80], ['/srv'])] },
  { slug: 'syncthing', name: 'Syncthing', description: 'Sincronização de arquivos P2P.', category: 'Produtividade & Cloud', logo: ic('syncthing'), website: 'https://syncthing.net', services: [app('syncthing/syncthing:latest', [8384], ['/var/syncthing'])] },
  { slug: 'trilium', name: 'Trilium Notes', description: 'Notas hierárquicas poderosas.', category: 'Produtividade & Cloud', logo: ic('trilium'), website: 'https://github.com/zadam/trilium', services: [app('zadam/trilium:latest', [8080], ['/home/node/trilium-data'])] },
  { slug: 'vikunja', name: 'Vikunja', description: 'Lista de tarefas e gestão de projetos.', category: 'Produtividade & Cloud', logo: ic('vikunja'), website: 'https://vikunja.io', services: [app('vikunja/vikunja:latest', [3456], ['/app/vikunja/files'])] },
  { slug: 'planka', name: 'Planka', description: 'Quadro kanban estilo Trello.', category: 'Produtividade & Cloud', logo: ic('planka'), website: 'https://planka.app', services: [app('ghcr.io/plankanban/planka:latest', [1337], ['/app/public/user-avatars'])] },
  { slug: 'wekan', name: 'Wekan', description: 'Kanban open-source.', category: 'Produtividade & Cloud', logo: ic('wekan'), website: 'https://wekan.github.io', services: [app('wekanteam/wekan:latest', [80], [])] },
  { slug: 'kanboard', name: 'Kanboard', description: 'Gestão de projetos minimalista.', category: 'Produtividade & Cloud', logo: ic('kanboard'), website: 'https://kanboard.org', services: [app('kanboard/kanboard:latest', [80], ['/var/www/app/data'])] },
  { slug: 'paperless-ngx', name: 'Paperless-ngx', description: 'Arquivo de documentos digitalizados.', category: 'Produtividade & Cloud', logo: ic('paperless-ngx'), website: 'https://docs.paperless-ngx.com', services: [app('ghcr.io/paperless-ngx/paperless-ngx:latest', [8000], ['/usr/src/paperless/data'])] },
  { slug: 'actual', name: 'Actual Budget', description: 'Finanças pessoais privadas.', category: 'Produtividade & Cloud', logo: ic('actual-budget'), website: 'https://actualbudget.org', services: [app('actualbudget/actual-server:latest', [5006], ['/data'])] },
  { slug: 'mealie', name: 'Mealie', description: 'Gerenciador de receitas.', category: 'Produtividade & Cloud', logo: ic('mealie'), website: 'https://mealie.io', services: [app('ghcr.io/mealie-recipes/mealie:latest', [9000], ['/app/data'])] },

  // ── Mídia ───────────────────────────────────────────────────
  { slug: 'jellyfin', name: 'Jellyfin', description: 'Servidor de mídia livre.', category: 'Mídia', logo: ic('jellyfin'), website: 'https://jellyfin.org', services: [app('jellyfin/jellyfin:latest', [8096], ['/config'])] },
  { slug: 'plex', name: 'Plex', description: 'Servidor de mídia popular.', category: 'Mídia', logo: ic('plex'), website: 'https://www.plex.tv', services: [app('plexinc/pms-docker:latest', [32400], ['/config'])] },
  { slug: 'navidrome', name: 'Navidrome', description: 'Streaming de música pessoal.', category: 'Mídia', logo: ic('navidrome'), website: 'https://www.navidrome.org', services: [app('deluan/navidrome:latest', [4533], ['/data'])] },
  { slug: 'audiobookshelf', name: 'Audiobookshelf', description: 'Audiolivros e podcasts.', category: 'Mídia', logo: ic('audiobookshelf'), website: 'https://www.audiobookshelf.org', services: [app('ghcr.io/advplyr/audiobookshelf:latest', [80], ['/config'])] },
  { slug: 'photoprism', name: 'PhotoPrism', description: 'Galeria de fotos com IA.', category: 'Mídia', logo: ic('photoprism'), website: 'https://www.photoprism.app', variables: ['ADMIN_PASSWORD'], services: [app('photoprism/photoprism:latest', [2342], ['/photoprism/storage'], { PHOTOPRISM_ADMIN_PASSWORD: '${ADMIN_PASSWORD}' })] },
  { slug: 'immich', name: 'Immich', description: 'Backup de fotos do celular (alt. Google Photos).', category: 'Mídia', logo: ic('immich'), website: 'https://immich.app', services: [app('ghcr.io/immich-app/immich-server:release', [2283], ['/usr/src/app/upload'])] },
  { slug: 'calibre-web', name: 'Calibre-Web', description: 'Biblioteca de e-books.', category: 'Mídia', logo: ic('calibre-web'), website: 'https://github.com/janeczku/calibre-web', services: [app('lscr.io/linuxserver/calibre-web:latest', [8083], ['/config'])] },
  { slug: 'jellyseerr', name: 'Jellyseerr', description: 'Pedidos de mídia para Jellyfin/Plex.', category: 'Mídia', logo: ic('jellyseerr'), website: 'https://github.com/Fallenbagel/jellyseerr', services: [app('fallenbagel/jellyseerr:latest', [5055], ['/app/config'])] },
  { slug: 'qbittorrent', name: 'qBittorrent', description: 'Cliente BitTorrent com web UI.', category: 'Mídia', logo: ic('qbittorrent'), website: 'https://www.qbittorrent.org', services: [app('lscr.io/linuxserver/qbittorrent:latest', [8080], ['/config'])] },
  { slug: 'sonarr', name: 'Sonarr', description: 'Gerência de séries.', category: 'Mídia', logo: ic('sonarr'), website: 'https://sonarr.tv', services: [app('lscr.io/linuxserver/sonarr:latest', [8989], ['/config'])] },
  { slug: 'radarr', name: 'Radarr', description: 'Gerência de filmes.', category: 'Mídia', logo: ic('radarr'), website: 'https://radarr.video', services: [app('lscr.io/linuxserver/radarr:latest', [7878], ['/config'])] },
  { slug: 'prowlarr', name: 'Prowlarr', description: 'Indexador para *arr.', category: 'Mídia', logo: ic('prowlarr'), website: 'https://prowlarr.com', services: [app('lscr.io/linuxserver/prowlarr:latest', [9696], ['/config'])] },

  // ── Ferramentas ─────────────────────────────────────────────
  { slug: 'minio', name: 'MinIO', description: 'Storage de objetos compatível com S3.', category: 'Ferramentas', logo: ic('minio'), website: 'https://min.io', variables: ['ROOT_PASSWORD'], services: [app('minio/minio:latest', [9000, 9001], ['/data'], { MINIO_ROOT_USER: 'admin', MINIO_ROOT_PASSWORD: '${ROOT_PASSWORD}' })] },
  { slug: 'it-tools', name: 'IT-Tools', description: 'Caixa de ferramentas para devs.', category: 'Ferramentas', logo: ic('it-tools'), website: 'https://it-tools.tech', services: [app('corentinth/it-tools:latest', [80])] },
  { slug: 'stirling-pdf', name: 'Stirling PDF', description: 'Manipulação de PDFs (juntar, dividir, OCR).', category: 'Ferramentas', logo: ic('stirling-pdf'), website: 'https://www.stirlingpdf.com', services: [app('frooodle/s-pdf:latest', [8080], [])] },
  { slug: 'excalidraw', name: 'Excalidraw', description: 'Quadro branco de desenho à mão.', category: 'Ferramentas', logo: ic('excalidraw'), website: 'https://excalidraw.com', services: [app('excalidraw/excalidraw:latest', [80])] },
  { slug: 'drawio', name: 'draw.io', description: 'Diagramas e fluxogramas.', category: 'Ferramentas', logo: ic('draw-io'), website: 'https://www.drawio.com', services: [app('jgraph/drawio:latest', [8080])] },
  { slug: 'homepage', name: 'Homepage', description: 'Dashboard de início para seus serviços.', category: 'Ferramentas', logo: ic('homepage'), website: 'https://gethomepage.dev', services: [app('ghcr.io/gethomepage/homepage:latest', [3000], ['/app/config'])] },
  { slug: 'homarr', name: 'Homarr', description: 'Dashboard bonito e configurável.', category: 'Ferramentas', logo: ic('homarr'), website: 'https://homarr.dev', services: [app('ghcr.io/homarr-labs/homarr:latest', [7575], ['/appdata'])] },
  { slug: 'dashy', name: 'Dashy', description: 'Dashboard personalizável.', category: 'Ferramentas', logo: ic('dashy'), website: 'https://dashy.to', services: [app('lissy93/dashy:latest', [80], ['/app/user-data'])] },
  { slug: 'heimdall', name: 'Heimdall', description: 'Painel de atalhos de aplicações.', category: 'Ferramentas', logo: ic('heimdall'), website: 'https://heimdall.site', services: [app('lscr.io/linuxserver/heimdall:latest', [80], ['/config'])] },
  { slug: 'changedetection', name: 'Change Detection', description: 'Monitora mudanças em páginas web.', category: 'Ferramentas', logo: ic('changedetection'), website: 'https://changedetection.io', services: [app('ghcr.io/dgtlmoon/changedetection.io:latest', [5000], ['/datastore'])] },
  { slug: 'freshrss', name: 'FreshRSS', description: 'Leitor de feeds RSS self-hosted.', category: 'Ferramentas', logo: ic('freshrss'), website: 'https://freshrss.org', services: [app('freshrss/freshrss:latest', [80], ['/var/www/FreshRSS/data'])] },
  { slug: 'searxng', name: 'SearXNG', description: 'Metabusca privada.', category: 'Ferramentas', logo: ic('searxng'), website: 'https://docs.searxng.org', services: [app('searxng/searxng:latest', [8080], ['/etc/searxng'])] },
  { slug: 'wallabag', name: 'Wallabag', description: 'Salvar artigos para ler depois.', category: 'Ferramentas', logo: ic('wallabag'), website: 'https://wallabag.org', services: [app('wallabag/wallabag:latest', [80], ['/var/www/wallabag/data'])] },
  { slug: 'linkwarden', name: 'Linkwarden', description: 'Gerenciador de favoritos com arquivamento.', category: 'Ferramentas', logo: ic('linkwarden'), website: 'https://linkwarden.app', services: [app('ghcr.io/linkwarden/linkwarden:latest', [3000], ['/data/data'])] },
  { slug: 'shlink', name: 'Shlink', description: 'Encurtador de URLs self-hosted.', category: 'Ferramentas', logo: ic('shlink'), website: 'https://shlink.io', services: [app('shlinkio/shlink:stable', [8080], [])] },
  { slug: 'grocy', name: 'Grocy', description: 'Gestão de despensa e casa.', category: 'Ferramentas', logo: ic('grocy'), website: 'https://grocy.info', services: [app('lscr.io/linuxserver/grocy:latest', [80], ['/config'])] },
  { slug: 'duplicati', name: 'Duplicati', description: 'Backups criptografados agendados.', category: 'Ferramentas', logo: ic('duplicati'), website: 'https://www.duplicati.com', services: [app('lscr.io/linuxserver/duplicati:latest', [8200], ['/config'])] },
];

export function listTemplates() {
  return TEMPLATES.map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    logo: t.logo,
    website: t.website,
    serviceCount: t.services.length,
    images: t.services.map((s) => s.image),
  }));
}

export function getTemplate(slug: string) {
  return TEMPLATES.find((t) => t.slug === slug) ?? null;
}

// Gera senha forte (URL-safe).
export function genSecret(len = 24) {
  return randomBytes(len).toString('base64url').slice(0, len);
}

// Resolve ${VAR} e ${slug} nos valores de env, dado o slug final e as variáveis geradas.
export function interpolate(value: string, slug: string, vars: Record<string, string>) {
  return value.replace(/\$\{(\w+)\}/g, (_m, name: string) => {
    if (name === 'slug') return slug;
    return vars[name] ?? '';
  });
}
