#!/bin/sh
set -eu

: "${AUTH_USER_1_USERNAME:?AUTH_USER_1_USERNAME is required}"
: "${AUTH_USER_1_PASSWORD:?AUTH_USER_1_PASSWORD is required}"
: "${AUTH_USER_2_USERNAME:?AUTH_USER_2_USERNAME is required}"
: "${AUTH_USER_2_PASSWORD:?AUTH_USER_2_PASSWORD is required}"
: "${INTERNAL_AUTH_SECRET:?INTERNAL_AUTH_SECRET is required}"

mkdir -p /etc/nginx/auth
htpasswd -bcB /etc/nginx/auth/.htpasswd "$AUTH_USER_1_USERNAME" "$AUTH_USER_1_PASSWORD"
htpasswd -bB /etc/nginx/auth/.htpasswd "$AUTH_USER_2_USERNAME" "$AUTH_USER_2_PASSWORD"
chown nginx:nginx /etc/nginx/auth/.htpasswd
chmod 640 /etc/nginx/auth/.htpasswd

envsubst '${INTERNAL_AUTH_SECRET}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
