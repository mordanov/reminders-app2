FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_BASE=/api
ARG VITE_APP_TIMEZONE=Europe/Madrid
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_APP_TIMEZONE=$VITE_APP_TIMEZONE
RUN npm run build

FROM nginx:1.29-alpine AS runtime

RUN apk add --no-cache apache2-utils gettext
COPY --from=frontend-build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/entrypoint.sh /usr/local/bin/reminders-entrypoint
RUN chmod +x /usr/local/bin/reminders-entrypoint

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/reminders-entrypoint"]
