FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
RUN apt-get update && apt-get install -y --no-install-recommends python3 git util-linux passwd \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1999 --no-log-init --no-create-home --shell /usr/sbin/nologin aktau-sync
ENV PATH=/usr/local/go/bin:/usr/sbin:/usr/bin:/bin GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOMAXPROCS=2 GOCACHE=/tmp/go-cache
WORKDIR /src
CMD ["python3", "-B", "ops/c2/root_bundle_integration.py"]
