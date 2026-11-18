# Production image of the backend: the five services + the gateway.
# Build from the repository root:
#   docker build -f deploy/backend/Dockerfile -t plateia-api .

# --- 1. Build: install everything, bundle the TypeScript services ----------
FROM node:24-slim AS build
WORKDIR /repo
ENV npm_config_audit=false npm_config_fund=false

# Manifests first, so the dependency layer is cached until a manifest changes.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/platform/package.json packages/platform/
COPY packages/web-kit/package.json packages/web-kit/
COPY services/catalog/package.json services/catalog/
COPY services/booking/package.json services/booking/
COPY services/payment/package.json services/payment/
COPY services/notification/package.json services/notification/
COPY services/backoffice/package.json services/backoffice/
COPY apps/shell/package.json apps/shell/
COPY apps/mfe-catalog/package.json apps/mfe-catalog/
COPY apps/mfe-booking/package.json apps/mfe-booking/
COPY apps/mfe-admin/package.json apps/mfe-admin/
RUN npm ci --loglevel=error

COPY tsconfig.base.json ./
COPY packages packages
COPY services services
COPY scripts scripts
COPY deploy/backend deploy/backend
RUN node deploy/backend/build.mjs

# --- 2. Runtime dependencies: only what the services import ---------------
FROM node:24-slim AS deps
WORKDIR /app
ENV npm_config_audit=false npm_config_fund=false
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/contracts/package.json packages/contracts/
COPY --from=build /repo/packages/platform/package.json packages/platform/
COPY --from=build /repo/services/catalog/package.json services/catalog/
COPY --from=build /repo/services/booking/package.json services/booking/
COPY --from=build /repo/services/payment/package.json services/payment/
COPY --from=build /repo/services/notification/package.json services/notification/
COPY --from=build /repo/services/backoffice/package.json services/backoffice/
RUN npm ci --omit=dev --loglevel=error \
      -w @plateia/catalog-service -w @plateia/booking-service -w @plateia/payment-service \
      -w @plateia/notification-service -w @plateia/backoffice-service

# --- 3. Runtime image -----------------------------------------------------
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    OTEL_SDK_DISABLED=true \
    PORT=8080
COPY --from=deps /app/node_modules node_modules
COPY --from=build /repo/deploy-dist ./
# Never run as root.
USER node
EXPOSE 8080
CMD ["node", "start.mjs"]
