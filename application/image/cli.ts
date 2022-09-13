import { Command } from "commander";
import { groupingCommand } from "./grouping-command.js";
import { LastBatchOpts, MainOpts } from "./opts.js";
import { listFingerprintsCommand } from "./list-fingerprints-command.js";

const program = new Command();

program
  .name("holmes-slack-report")
  .description("CLI to report Holmes details to Slack")
  .option("--channel <channel>", "Slack channel to send report to")
  .option(
    "--bucket <bucket>",
    "Name of bucket where fingerprints are held",
    // only for dev work would be ever need to change this
    "umccr-fingerprint-prod"
  )
  .option(
    "--sc <checksum>",
    "Sites checksum (which folder of Holmes bucket to look at for fingerprints)",
    // only when we fundamentally change the sites file for Holmes would be need to change this
    "ad0e523b19164b9af4dda86c90462f6a" // pragma: allowlist secret
  )
  .version("0.1.0");

program
  .command("grouping")
  .description(
    "Perform a grouping analysis of the most recent (or a particular day) fingerprints to arrive in Holmes against all other fingerprints, and report it to Slack"
  )
  .option<number>(
    "--days <number>",
    "the number of days ago to target for fingerprints",
    parseInt
  )
  .option<number>(
    "--concurrency <number>",
    "the concurrency settings for our steps invocations",
    parseInt,
    5
  )
  .option<number>(
    "--relatedness <number>",
    "the relatedness between fingerprints to consider them interesting",
    parseFloat,
    0.75
  )
  .action(async (options: LastBatchOpts, command: Command) => {
    await groupingCommand(command.parent!.opts<MainOpts>(), options);
  });

program
  .command("list-fingerprints")
  .description(
    "List the URLs of all BAMs that are fingerprinted (to console not Slack!)"
  )
  .action(async (options, command: Command) => {
    await listFingerprintsCommand(command.parent!.opts<MainOpts>());
  });

await program.parseAsync();
