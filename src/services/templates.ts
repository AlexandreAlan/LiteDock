// Catálogo de templates (apps prontos), estilo "loja" do EasyPanel.
// Cada template cria um ou mais serviços com imagem, portas, env e volumes.
// Self-hosted: sem chamadas externas — logos são emoji/iniciais.
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
  logo: string; // emoji
  website?: string;
  variables?: string[]; // gerados como senha forte por instalação
  services: TemplateService[];
}

export const CATEGORIES = [
  'CMS & Blog',
  'Automação',
  'Banco de dados',
  'Análise',
  'Comunicação',
  'Ferramentas',
] as const;

export const TEMPLATES: Template[] = [
  // ── CMS & Blog ──────────────────────────────────────────────
  {
    slug: 'wordpress',
    name: 'WordPress',
    description: 'O CMS mais usado do mundo, com banco MySQL dedicado.',
    category: 'CMS & Blog',
    logo: '📝',
    website: 'https://wordpress.org',
    variables: ['DB_PASSWORD', 'DB_ROOT_PASSWORD'],
    services: [
      {
        name: 'app',
        type: 'app',
        image: 'wordpress:latest',
        ports: [80],
        volumes: ['/var/www/html'],
        env: {
          WORDPRESS_DB_HOST: '${slug}-db',
          WORDPRESS_DB_USER: 'wordpress',
          WORDPRESS_DB_PASSWORD: '${DB_PASSWORD}',
          WORDPRESS_DB_NAME: 'wordpress',
        },
      },
      {
        name: 'db',
        type: 'database',
        image: 'mysql:8',
        volumes: ['/var/lib/mysql'],
        env: {
          MYSQL_DATABASE: 'wordpress',
          MYSQL_USER: 'wordpress',
          MYSQL_PASSWORD: '${DB_PASSWORD}',
          MYSQL_ROOT_PASSWORD: '${DB_ROOT_PASSWORD}',
        },
      },
    ],
  },
  {
    slug: 'ghost',
    name: 'Ghost',
    description: 'Plataforma de blog e newsletter moderna e rápida.',
    category: 'CMS & Blog',
    logo: '👻',
    website: 'https://ghost.org',
    services: [
      { name: 'app', type: 'app', image: 'ghost:5', ports: [2368], volumes: ['/var/lib/ghost/content'], env: { url: 'http://localhost:2368' } },
    ],
  },
  {
    slug: 'directus',
    name: 'Directus',
    description: 'Headless CMS e API instantânea sobre seu banco.',
    category: 'CMS & Blog',
    logo: '🗂️',
    website: 'https://directus.io',
    variables: ['SECRET', 'ADMIN_PASSWORD'],
    services: [
      {
        name: 'app',
        type: 'app',
        image: 'directus/directus:latest',
        ports: [8055],
        env: { KEY: '${SECRET}', SECRET: '${SECRET}', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: '${ADMIN_PASSWORD}' },
      },
    ],
  },

  // ── Automação ───────────────────────────────────────────────
  {
    slug: 'n8n',
    name: 'n8n',
    description: 'Automação de fluxos de trabalho (low-code) auto-hospedada.',
    category: 'Automação',
    logo: '🔗',
    website: 'https://n8n.io',
    variables: ['ENCRYPTION_KEY'],
    services: [
      {
        name: 'app',
        type: 'app',
        image: 'n8nio/n8n:latest',
        ports: [5678],
        volumes: ['/home/node/.n8n'],
        env: { N8N_ENCRYPTION_KEY: '${ENCRYPTION_KEY}', N8N_HOST: '0.0.0.0', N8N_PORT: '5678' },
      },
    ],
  },
  {
    slug: 'node-red',
    name: 'Node-RED',
    description: 'Programação visual orientada a fluxo para IoT e APIs.',
    category: 'Automação',
    logo: '🟥',
    website: 'https://nodered.org',
    services: [{ name: 'app', type: 'app', image: 'nodered/node-red:latest', ports: [1880], volumes: ['/data'] }],
  },

  // ── Banco de dados ──────────────────────────────────────────
  {
    slug: 'postgres',
    name: 'PostgreSQL',
    description: 'Banco relacional robusto e open source.',
    category: 'Banco de dados',
    logo: '🐘',
    website: 'https://www.postgresql.org',
    variables: ['DB_PASSWORD'],
    services: [
      { name: 'db', type: 'database', image: 'postgres:16', ports: [5432], volumes: ['/var/lib/postgresql/data'], env: { POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: '${DB_PASSWORD}', POSTGRES_DB: 'app' } },
    ],
  },
  {
    slug: 'mysql',
    name: 'MySQL',
    description: 'Banco relacional clássico, compatível com tudo.',
    category: 'Banco de dados',
    logo: '🐬',
    website: 'https://www.mysql.com',
    variables: ['DB_PASSWORD', 'DB_ROOT_PASSWORD'],
    services: [
      { name: 'db', type: 'database', image: 'mysql:8', ports: [3306], volumes: ['/var/lib/mysql'], env: { MYSQL_DATABASE: 'app', MYSQL_USER: 'app', MYSQL_PASSWORD: '${DB_PASSWORD}', MYSQL_ROOT_PASSWORD: '${DB_ROOT_PASSWORD}' } },
    ],
  },
  {
    slug: 'mongodb',
    name: 'MongoDB',
    description: 'Banco de documentos NoSQL flexível.',
    category: 'Banco de dados',
    logo: '🍃',
    website: 'https://www.mongodb.com',
    variables: ['DB_PASSWORD'],
    services: [
      { name: 'db', type: 'database', image: 'mongo:7', ports: [27017], volumes: ['/data/db'], env: { MONGO_INITDB_ROOT_USERNAME: 'root', MONGO_INITDB_ROOT_PASSWORD: '${DB_PASSWORD}' } },
    ],
  },
  {
    slug: 'redis',
    name: 'Redis',
    description: 'Cache e estrutura de dados em memória.',
    category: 'Banco de dados',
    logo: '🟥',
    website: 'https://redis.io',
    services: [{ name: 'db', type: 'database', image: 'redis:7', ports: [6379], volumes: ['/data'] }],
  },
  {
    slug: 'minio',
    name: 'MinIO',
    description: 'Armazenamento de objetos compatível com S3.',
    category: 'Banco de dados',
    logo: '🪣',
    website: 'https://min.io',
    variables: ['ROOT_PASSWORD'],
    services: [
      { name: 'app', type: 'app', image: 'minio/minio:latest', ports: [9000, 9001], volumes: ['/data'], env: { MINIO_ROOT_USER: 'admin', MINIO_ROOT_PASSWORD: '${ROOT_PASSWORD}' } },
    ],
  },

  // ── Análise ─────────────────────────────────────────────────
  {
    slug: 'plausible',
    name: 'Plausible',
    description: 'Análise web leve e focada em privacidade (sem cookies).',
    category: 'Análise',
    logo: '📊',
    website: 'https://plausible.io',
    variables: ['SECRET_KEY_BASE', 'DB_PASSWORD'],
    services: [
      { name: 'app', type: 'app', image: 'plausible/analytics:latest', ports: [8000], env: { SECRET_KEY_BASE: '${SECRET_KEY_BASE}', DATABASE_URL: 'postgres://postgres:${DB_PASSWORD}@${slug}-db:5432/plausible' } },
      { name: 'db', type: 'database', image: 'postgres:16', volumes: ['/var/lib/postgresql/data'], env: { POSTGRES_DB: 'plausible', POSTGRES_PASSWORD: '${DB_PASSWORD}' } },
    ],
  },
  {
    slug: 'metabase',
    name: 'Metabase',
    description: 'BI e dashboards — pergunte aos seus dados.',
    category: 'Análise',
    logo: '📈',
    website: 'https://www.metabase.com',
    services: [{ name: 'app', type: 'app', image: 'metabase/metabase:latest', ports: [3000], volumes: ['/metabase-data'] }],
  },
  {
    slug: 'grafana',
    name: 'Grafana',
    description: 'Dashboards e observabilidade de métricas.',
    category: 'Análise',
    logo: '📉',
    website: 'https://grafana.com',
    variables: ['ADMIN_PASSWORD'],
    services: [{ name: 'app', type: 'app', image: 'grafana/grafana:latest', ports: [3000], volumes: ['/var/lib/grafana'], env: { GF_SECURITY_ADMIN_PASSWORD: '${ADMIN_PASSWORD}' } }],
  },
  {
    slug: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Monitor de uptime self-hosted, bonito e simples.',
    category: 'Análise',
    logo: '🟢',
    website: 'https://github.com/louislam/uptime-kuma',
    services: [{ name: 'app', type: 'app', image: 'louislam/uptime-kuma:1', ports: [3001], volumes: ['/app/data'] }],
  },

  // ── Comunicação ─────────────────────────────────────────────
  {
    slug: 'rocketchat',
    name: 'Rocket.Chat',
    description: 'Plataforma de chat em equipe (alternativa ao Slack).',
    category: 'Comunicação',
    logo: '🚀',
    website: 'https://rocket.chat',
    services: [
      { name: 'app', type: 'app', image: 'rocket.chat:latest', ports: [3000], env: { MONGO_URL: 'mongodb://${slug}-db:27017/rocketchat' } },
      { name: 'db', type: 'database', image: 'mongo:6', volumes: ['/data/db'] },
    ],
  },
  {
    slug: 'mattermost',
    name: 'Mattermost',
    description: 'Colaboração de times segura e open source.',
    category: 'Comunicação',
    logo: '💬',
    website: 'https://mattermost.com',
    services: [{ name: 'app', type: 'app', image: 'mattermost/mattermost-team-edition:latest', ports: [8065], volumes: ['/mattermost/data'] }],
  },

  // ── Ferramentas ─────────────────────────────────────────────
  {
    slug: 'nextcloud',
    name: 'Nextcloud',
    description: 'Sua nuvem privada de arquivos, calendário e contatos.',
    category: 'Ferramentas',
    logo: '☁️',
    website: 'https://nextcloud.com',
    variables: ['DB_PASSWORD'],
    services: [
      { name: 'app', type: 'app', image: 'nextcloud:latest', ports: [80], volumes: ['/var/www/html'], env: { POSTGRES_HOST: '${slug}-db', POSTGRES_DB: 'nextcloud', POSTGRES_USER: 'nextcloud', POSTGRES_PASSWORD: '${DB_PASSWORD}' } },
      { name: 'db', type: 'database', image: 'postgres:16', volumes: ['/var/lib/postgresql/data'], env: { POSTGRES_DB: 'nextcloud', POSTGRES_USER: 'nextcloud', POSTGRES_PASSWORD: '${DB_PASSWORD}' } },
    ],
  },
  {
    slug: 'gitea',
    name: 'Gitea',
    description: 'Git self-hosted leve (alternativa ao GitHub).',
    category: 'Ferramentas',
    logo: '🍵',
    website: 'https://gitea.io',
    services: [{ name: 'app', type: 'app', image: 'gitea/gitea:latest', ports: [3000, 22], volumes: ['/data'] }],
  },
  {
    slug: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Gerenciador de senhas compatível com Bitwarden.',
    category: 'Ferramentas',
    logo: '🔐',
    website: 'https://github.com/dani-garcia/vaultwarden',
    variables: ['ADMIN_TOKEN'],
    services: [{ name: 'app', type: 'app', image: 'vaultwarden/server:latest', ports: [80], volumes: ['/data'], env: { ADMIN_TOKEN: '${ADMIN_TOKEN}' } }],
  },
  {
    slug: 'pocketbase',
    name: 'PocketBase',
    description: 'Backend em 1 arquivo: banco, auth e API REST.',
    category: 'Ferramentas',
    logo: '🪶',
    website: 'https://pocketbase.io',
    services: [{ name: 'app', type: 'app', image: 'ghcr.io/muchobien/pocketbase:latest', ports: [8090], volumes: ['/pb_data'] }],
  },
  {
    slug: 'nocodb',
    name: 'NocoDB',
    description: 'Transforma qualquer banco numa planilha inteligente.',
    category: 'Ferramentas',
    logo: '🟩',
    website: 'https://nocodb.com',
    services: [{ name: 'app', type: 'app', image: 'nocodb/nocodb:latest', ports: [8080], volumes: ['/usr/app/data'] }],
  },
  {
    slug: 'adminer',
    name: 'Adminer',
    description: 'Administração de banco de dados em um só arquivo.',
    category: 'Ferramentas',
    logo: '🛢️',
    website: 'https://www.adminer.org',
    services: [{ name: 'app', type: 'app', image: 'adminer:latest', ports: [8080] }],
  },
];

// Versão "pública" (sem detalhes pesados) pra listagem.
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
