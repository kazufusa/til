FROM debian:bookworm-slim

# Runtime deps:
#  - pandoc        for `pandoc` backend (docx/xlsx/pptx → GFM)
#  - libreoffice   for `gemini-pdf` backend (office → PDF via headless soffice)
#  - curl, ca-certs, unzip  to install bun
#  - gcloud SDK    for Vertex AI ADC (Application Default Credentials)
RUN apt-get update && apt-get install -y --no-install-recommends \
        pandoc \
        libreoffice \
        curl ca-certificates unzip \
        python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# MarkItDown CLI for the `markitdown` backend (Microsoft, docx/xlsx/pptx/pdf
# → markdown). `[all]` pulls in the optional handlers (xlsx via openpyxl, etc).
RUN pip3 install --no-cache-dir --break-system-packages 'markitdown[all]'

# Bun. Pinned by env to avoid stable-channel drift.
ENV BUN_VERSION=1.3.12
RUN curl -fsSL https://bun.sh/install | bash -s -- "bun-v${BUN_VERSION}"
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Install deps before copying code so layer caches.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# .env should be provided at runtime (-v / --env-file), and ADC mounted:
#   docker run --rm -v "$PWD:/app" -v ~/.config/gcloud:/root/.config/gcloud \
#       --env-file .env <image> bun run convert.ts fixtures/docx/sample.docx
ENTRYPOINT ["bun", "run"]
CMD ["convert.ts", "--help"]
