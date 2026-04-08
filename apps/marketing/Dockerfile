FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3003

CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-3000}"]
