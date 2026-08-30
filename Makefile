COMPOSE ?= docker compose

.PHONY: up down build lint test coverage reset

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build backend nginx

lint:
	$(COMPOSE) --profile lint run --build --rm backend-lint
	$(COMPOSE) --profile lint run --build --rm frontend-lint

test:
	$(COMPOSE) --profile test run --build --rm backend-test
	$(COMPOSE) --profile test run --build --rm frontend-test

coverage:
	$(COMPOSE) --profile coverage run --build --rm backend-coverage
	$(COMPOSE) --profile coverage run --build --rm frontend-coverage

reset:
	$(COMPOSE) down --volumes
