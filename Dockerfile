# Stage 1: reduce the 124 MB raw mhrice dump to the ~2 MB the simulator needs.
FROM python:3.12-slim AS data-extractor
WORKDIR /build
COPY tools/extract_data.py ./extract_data.py
COPY mhrice.json ./mhrice.json
RUN python extract_data.py mhrice.json game-data.json

# Stage 2: serve the static site.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/
COPY --from=data-extractor /build/game-data.json /usr/share/nginx/html/data/game-data.json
EXPOSE 7337
