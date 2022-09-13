FROM public.ecr.aws/lambda/nodejs:16

COPY package* ./
RUN npm ci

COPY * ./
RUN npx esbuild --bundle lambda.cts --platform=node > entrypoint.cjs

CMD [ "entrypoint.handler"]
