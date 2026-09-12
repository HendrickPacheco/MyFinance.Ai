# syntax=docker/dockerfile:1

# Imagem de producao do app.
#
# Debian slim (nao alpine) porque @node-rs/argon2 traz binario nativo e o glibc
# evita surpresa de musl.
#
# As devDependencies FICAM na imagem final de proposito: os scripts de
# administracao (seed-owner, redefinir-senha, verificar-isolamento) rodam via
# tsx, que e devDependency. Podar deixaria o app sem como criar o dono.

FROM node:22-bookworm-slim AS base
# O Prisma carrega o query engine ligado ao libssl; sem openssl ele avisa
# "failed to detect the libssl/openssl version" e cai para um engine errado.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Estagios de build usam pnpm; o runtime NAO — ver comentario no runner.
FROM base AS toolchain
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# ---------------------------------------------------------------- dependencias
FROM toolchain AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------- build
FROM toolchain AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# O `prebuild` roda `prisma generate`, que le a datasource e por isso exige a
# variavel definida — mas NAO conecta no banco. Esta URL e descartavel; a real
# chega em tempo de execucao pelo compose.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN pnpm build

# --------------------------------------------------------------------- runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Os binarios do pnpm ficam linkados aqui. Chamamos next/prisma/tsx por este
# PATH em vez de `pnpm start`: o corepack foi ativado como root durante o build
# e o runtime roda como `node`, que nao enxerga essa ativacao — ele baixaria
# outro pnpm e refaria o install no boot, trocando as versoes ja compiladas.
ENV PATH=/app/node_modules/.bin:$PATH

COPY --from=build --chown=node:node /app ./
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["next", "start"]
