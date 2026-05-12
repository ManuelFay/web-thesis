FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        texlive-full \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.texmf/web2c \
    && printf '\nparam_size=100000\n' >> /root/.texmf/web2c/texmf.cnf \
    && mktexlsr

WORKDIR /work
COPY . .

RUN mkdir -p build/chapters \
    && latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir=build main.tex \
    && test -f build/main.pdf

FROM scratch AS artifact
COPY --from=builder /work/build/main.pdf /Thesis.pdf
