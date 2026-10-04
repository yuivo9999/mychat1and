FROM node:20-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
