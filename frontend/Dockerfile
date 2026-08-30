FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=/api
ARG VITE_APP_TIMEZONE=Europe/Madrid
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_APP_TIMEZONE=$VITE_APP_TIMEZONE
RUN npm run build

FROM build AS test
CMD ["npm", "run", "test"]

FROM scratch AS export
COPY --from=build /app/dist /dist
