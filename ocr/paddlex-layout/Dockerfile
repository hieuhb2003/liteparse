FROM ghcr.io/astral-sh/uv:python3.12-trixie
WORKDIR /app
COPY pyproject.toml .
COPY my_config/ my_config/
RUN uv sync
COPY normalize.py server.py ./
EXPOSE 8830
CMD ["uv", "run", "python3", "server.py"]
