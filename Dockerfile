# Actora: a static Vite build served by nginx, for Cloud Run.
#
# Vite bakes VITE_* values in at build time, and .env files are not in the
# image (.dockerignore), so the backend URL comes from a build arg. Supabase is
# read at runtime from Aelora's /api/public-config, so it needs no args here.
#   docker build --build-arg VITE_AELORA_BASE_URL=https://… .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_AELORA_BASE_URL=https://aelora-312386972258.us-west1.run.app
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_AELORA_BASE_URL=$VITE_AELORA_BASE_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_AELORA_MOCK=0
RUN npm run build

FROM nginx:1.27-alpine
# The official image renders /etc/nginx/templates/*.template with envsubst at
# start, filling in ${PORT} (Cloud Run sets it; 8080 by default).
ENV PORT=8080
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
