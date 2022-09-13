The code here is _both_

- A lambda/Docker for execution by Cron
- A CLI tool

Basically this started as a CLI and has migrated to being a
Lambda. We have tried to keep the CLI tool functionality
available but no guarantees - as now this mainly executes
via the Lambda entry point.

## Lambda

The Lambda is deployed via CDK and tied to a regular Cron
schedule. Its output will go to the correct Slack channel
depending on the environment.

Potentially the Lambda could offer interactive services via the Slack
app to almost make a CLI tool (i.e. /holmes list-fingerprints). THIS
HAS NOT AT ALL BEEN IMPLEMENTED - BUT IS WHY WE ARE KEEPING SOME
OF THIS CLI FUNCTIONALITY HERE.

## CLI

Some executions for CLI that have worked in the past

Find the last batch in dev and report to Pattos channel

```
npx ts-node cli.ts --bucket umccr-fingerprint-dev --channel U029NVAK56W last-batch
```

List all the fingerprints to console

```
npx ts-node cli.ts --channel \"#biobots\" list-fingerprints
```

Assuming running in prod - trigger a report to the #biobots channel
(this is the functionality now being run via the Cron based lambda)

```
npx ts-node cli.ts --channel \"#biobots\" last-batch"
```
