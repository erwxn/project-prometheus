# Run Prometheus with Docker

Install Docker Engine with Compose v2, or Docker Desktop with Linux containers. Start Docker before running these commands from the repository root. No local Node.js or Python installation is required.

```sh
docker compose up --build -d
```

Open http://localhost:8080. Home, Explore, Analyze, Monitor and About are served by Nginx; `/api/` and `/health` are forwarded to the Node 24 API. Compose waits for the API health check before starting the web service.

The default configuration loads the bundled **Morocco 2014 historical delivery preview**, not current fires or the full archive. The interface retains the dataset's preview/provenance labels. No NASA account, Azure token or private `.env` file is needed for this preview. Basemap tiles and external searches still require Internet. Initial image builds also require Internet.

## Verify and stop

```sh
docker compose ps
docker compose exec api node docker-smoke.cjs
docker compose logs --tail=50
docker compose down
```

The smoke check covers the web routes, a built asset, API health, the historical feed and its preview label. Browser WebGL rendering is a separate check.

## Share the exact images with judges

`docker compose up --build` builds the checked-out source using the lockfile. To give judges the exact images already built on your machine (for a compatible CPU architecture):

```sh
docker image save -o prometheus-images.tar prometheus-api:local prometheus-web:local
```

Send the archive alongside the same repository revision. On their machine:

```sh
docker image load -i prometheus-images.tar
docker compose up --no-build -d
```

Images are built locally; no registry publication is configured. Tags are local labels, not immutable release identifiers. Base image tags may receive updates. Record the repository commit and image IDs (`docker compose images`) when preparing the final submission. An image built for amd64 is not a native arm64 image.

## Scope and data

This packages the web application and API, not the ML training/collection pipeline. The built frontend includes the homepage's images and animations. Only the small historical preview ZIP is bundled; private files, local databases, `.env` files and host dependencies are excluded from the build context.

To use another data source, configure the API environment using [harmonized-feed.md](harmonized-feed.md), remove `HARMONIZED_LOCAL_FILE` when selecting a remote source, and supply credentials only at runtime. Do not bake credentials into images. Local CSV uploads are temporary; this Compose setup does not create persistent data volumes. The default host port is bound to loopback for local review.

Design references: [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/) and [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).
