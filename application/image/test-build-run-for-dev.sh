#!/bin/zsh

# To be run in a dev AWS environment - will build the image, trigger the code

docker build -t holmes-slack-cron .

# this is the sites checksum
SC="ad0e523b19164b9af4dda86c90462f6a" # pragma: allowlist secret

# Use Patto personal channel
C="U029NVAK56W"   # pragma: allowlist secret

# Use dev reporting channel
# C="#arteria-dev"

CONTAINER=$(docker run -d --rm -p 9000:8080  \
 --env AWS_REGION=ap-southeast-2 \
 --env AWS_ACCESS_KEY_ID \
 --env AWS_SECRET_ACCESS_KEY \
 --env AWS_SESSION_TOKEN \
 --env BUCKET="umccr-fingerprint-dev" \
 --env SITES_CHECKSUM="$SC" \
 --env CHANNEL="$C" \
 holmes-slack-cron)

sleep 2

curl -s -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}' | jq .

docker kill $CONTAINER
