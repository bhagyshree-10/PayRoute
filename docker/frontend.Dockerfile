FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

RUN npm ci

COPY shared/ ./shared/
COPY frontend/ ./frontend/

RUN npm run build -w shared
RUN npm run build -w frontend

FROM nginx:alpine AS runner
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
