import { WebClient } from "@slack/web-api";
import {
  _Object,
  ListObjectsV2Command,
  ListObjectsV2Output,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import {
  DiscoverInstancesCommand,
  ServiceDiscoveryClient,
} from "@aws-sdk/client-servicediscovery";
import { format, isSameDay, max, subDays } from "date-fns";
import pLimit from "p-limit";
import { basename } from "path";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { LastBatchOpts, MainOpts } from "./opts";

/**
 * A quick interface showing the structure of the results we
 * get back from a somalier check.
 */
export interface SomalierFingerprint {
  file: string;
  n: number;
  relatedness: number;
  shared_hets: number;
  shared_hom_alts: number;

  base?: string;
  subject?: string;
  library?: string;
}

export interface OkGroup {
  subjectId: string;
  count: number;
}

export function bucketKeyToUrl(mainOpts: MainOpts, key: string) {
  const buf = Buffer.from(key.substring(mainOpts.sc.length + 1), "hex");
  return buf.toString("utf8");
}

/**
 * Get the Slack web client for our app.
 */
export async function getSlackWebClient() {
  const SECRET_FIELD = "HolmesBotUserOAuthToken"; // pragma: allowlist secret
  const secretsClient = new SecretsManagerClient({});

  // determine our access to the Slack app we want to report with
  const slackSecretsOutput = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: "SlackApps",
    })
  );

  if (!slackSecretsOutput.SecretString) {
    throw new Error(
      "There need to be a 'SlackApps' Secret with secrets for all our Slack apps"
    );
  }
  const slackSecrets = JSON.parse(slackSecretsOutput.SecretString);

  if (!(SECRET_FIELD in slackSecrets))
    throw new Error(
      `There need to be a 'SlackApps' Secret with field ${SECRET_FIELD} with our OAuth token`
    );

  return new WebClient(slackSecrets[SECRET_FIELD]);
}

/**
 * Do a service discovery to find where the Holmes steps functions live. Return
 * the ARN of the check Steps function.
 */
export async function findCheck() {
  const cloudMapClient = new ServiceDiscoveryClient({});

  const holmes = await cloudMapClient.send(
    new DiscoverInstancesCommand({
      NamespaceName: "umccr",
      ServiceName: "fingerprint",
    })
  );

  if (!holmes.Instances || holmes.Instances.length < 1)
    throw new Error("Found no holmes instance in our namespace");

  if (
    !holmes.Instances[0].Attributes ||
    !("checkStepsArn" in holmes.Instances[0].Attributes)
  )
    throw new Error(
      "Holmes cloudmap instance did not have a check steps arn for us to invoke"
    );

  return holmes.Instances[0].Attributes!["checkStepsArn"]!;
}

/**
 * Find the subject id from a file - assuming the standard UMCCR file naming conventions.
 *
 * @param url
 */
function extractSubjectId(url: string): string | undefined {
  const subjectMatches = url.match(/.*(SBJ\d\d\d\d\d).*/);

  // if we DON'T match a single subject then we return null and let the caller deal
  if (!subjectMatches || subjectMatches.length < 2) return undefined;
  else return subjectMatches[1];
}

/**
 * Find the library id from a file - assuming the standard UMCCR file naming conventions.
 *
 * @param url
 */
function extractLibraryId(url: string): string | undefined {
  const libraryMatches = url.match(/.*(L\d\d\d\d\d\d\d).*/);

  // if we DON'T match a single library then we return null and let the caller deal
  if (!libraryMatches || libraryMatches.length < 2) return undefined;
  else return libraryMatches[1];
}

/**
 * Given a list of BAM Urls (generally from a single sequencing run batch) - this will check
 * them each against the existing pool of BAMs and group them semantically.
 *
 * @param opts options from the command line
 * @param checkStepsArn the check step function to use
 * @param urls the list of URLs in the batch
 */
export async function groupUrls(
  opts: LastBatchOpts,
  checkStepsArn: string,
  urls: string[]
) {
  // any subject id from a group of only 1 (i.e. itself)
  const unmatchedIndividualSubjectIds: string[] = [];

  // any subject ids that found themselves in a group but where all the subject ids matched
  // we store these by subject Id because we only want to report each group once
  const matchedGroupSubjectIds: { [s: string]: OkGroup } = {};

  // group information about anything we want to alert about
  const matchResults: any[][] = [];

  // we are having some 'too many lambda executions' problems - we should fix this in the steps functions
  // themselves (especially those with huge fanouts - should handle with some retries)
  // but for the moment we limit the concurrency here
  const limit = pLimit(opts.concurrency);

  await Promise.all(
    urls.map((url) =>
      limit(doStepsExecution, new SFNClient({}), checkStepsArn, {
        index: url,
        relatednessThreshold: opts.relatedness,
        excludeRegex: ".*(NTC_|PTC_).*",
      })
        .then((fingerprintCheckResult: SomalierFingerprint[]) => {
          // if only a single entry in the result - then we matched only with ourselves.. we are new individuals
          if (fingerprintCheckResult.length === 0) {
            // this shouldn't happen but if it does we shouldn't fail
          } else if (
            fingerprintCheckResult.length === 1 &&
            fingerprintCheckResult[0].file === url
          ) {
            const subjectId = extractSubjectId(url);

            if (subjectId) unmatchedIndividualSubjectIds.push(subjectId);
            else {
              // this shouldn't happen - but if we find an unmatched entry - but it has no Subject Id then
              // we will display it like it was a 'bad' group
              matchResults.push(fingerprintCheckResult);
            }
          } else {
            // we were a group of related fingerprints - we need to process further
            const subjects = new Set<string>();
            let count = 0;

            for (const f of fingerprintCheckResult) {
              const subjectId = extractSubjectId(f.file);

              // if we DON'T find any subject id - then we really kind of want to abort
              // and make sure the group is reported.. so we add the unique filename as
              // a subject id - which will cause the later logic to force the group report
              if (!subjectId) subjects.add(f.file);
              else subjects.add(subjectId);

              count++;
            }

            if (subjects.size === 1) {
              const subjectId: string = subjects.values().next().value;

              if (!(subjectId in matchedGroupSubjectIds))
                matchedGroupSubjectIds[subjectId] = {
                  subjectId: subjectId,
                  count: count,
                };
            } else matchResults.push(fingerprintCheckResult);
          }
        })
        .catch((err: any) => {
          console.log(err);

          throw new Error(
            "One of the fingerprint step executions failed so we are failing the whole check - sometimes this is caused by too many Lambdas running (dial back stepsConcurrent?)"
          );
        })
    )
  );

  // match results is now an array or arrays - where the inner arrays are somalier fingerprint groups
  // HOWEVER - those groups are in some ways symmetric i.e. A->B comes back also as B->A
  // so we want to tidy up to get a useful slack message

  const matchGroups: Map<string, SomalierFingerprint>[] = [];

  while (matchResults.length > 0) {
    // we sort by those that match the most
    // and try to subset the others into that bigger group
    const sortedMatchResults = matchResults.sort((a, b) => b.length - a.length);

    // make a Set of the files involved in this 'biggest' group
    const nextGroupFileSet = new Set(sortedMatchResults[0].map((a) => a.file));

    // for every other group - see if we are a true subset - and if so delete
    for (let i = sortedMatchResults.length - 1; i >= 1; i--) {
      const potentialMerge = sortedMatchResults[i];
      const potentialMergeFileSet = new Set(potentialMerge.map((a) => a.file));

      if (isSuperset(nextGroupFileSet, potentialMergeFileSet)) {
        sortedMatchResults.splice(i, 1);
      }
    }

    // turn the big group into a result we can show
    matchGroups.push(
      // funky! take the 'file' field OUT of the structure and make it a key of a Map
      // then add in some extra fields
      new Map(
        sortedMatchResults[0].map((i) => [
          i.file,
          (({ file, ...o }) => ({
            ...o,
            subject: extractSubjectId(i.file),
            library: extractLibraryId(i.file),
            base: basename(i.file),
          }))(i),
        ])
      )
    );

    // delete the biggest group from the array and go around again
    sortedMatchResults.splice(0, 1);
  }

  return {
    unmatchedIndividualSubjectIds: unmatchedIndividualSubjectIds,
    matchedGroupSubjectIds: Object.values(matchedGroupSubjectIds),
    matchGroups,
  };
}

function isSuperset(set: Set<string>, subset: Set<string>) {
  for (const elem of subset.values()) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

/**
 * Execute a steps function and wait for the result (via polling)
 *
 * @param stepsClient
 * @param stepsArn
 * @param inp
 */
export async function doStepsExecution(
  stepsClient: SFNClient,
  stepsArn: string,
  inp: any
): Promise<any> {
  try {
    const stepExecuteResult = await stepsClient.send(
      new StartExecutionCommand({
        stateMachineArn: stepsArn,
        input: JSON.stringify(inp),
      })
    );

    if (!stepExecuteResult.executionArn) {
      console.log(stepExecuteResult);
      throw new Error("Step failed to execute");
    }

    let stepResult: any = {};

    while (true) {
      const execResult = await stepsClient.send(
        new DescribeExecutionCommand({
          executionArn: stepExecuteResult.executionArn,
        })
      );

      if (execResult.output) {
        stepResult = JSON.parse(execResult.output);
      }

      if (execResult.status == "ABORTED" || execResult.status == "FAILED") {
        console.log(execResult);
        throw new Error("Unexpected failure status");
      }

      if (execResult.status != "RUNNING") break;

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return stepResult;
  } catch (e) {
    console.log(e);
    throw new Error("Step failed to execute");
  }
}

/**
 * List all the fingerprint files in a bucket for a given sites file (identified by
 * its checksum).
 *
 * @param bucketName
 * @param sitesChecksum
 */
export async function* s3ListAllFingerprintFiles(
  bucketName: string,
  sitesChecksum: string
): AsyncGenerator<_Object> {
  const s3Client = new S3Client({});

  let contToken = undefined;

  do {
    const data: ListObjectsV2Output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: sitesChecksum,
        ContinuationToken: contToken,
      })
    );

    contToken = data.NextContinuationToken;

    for (const file of data.Contents || []) yield file;
  } while (contToken);
}

// another piece of functionality - read a set of URIs from a file and print every one that doesn't exist
// as a fingerprint - then do a report on them all
/*if (false) {
  const wantedSet = new Set<string>();

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream("holmes_request.txt"),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      wantedSet.add(line.trim());
    });

    await events.once(rl, "close");
  } catch (err) {
    console.error(err);
  }

  const fingerprintSet = new Set<string>();

  for (const c of allFingerprints) {
    fingerprintSet.add(bucketKeyToUrl(c.Key!));
  }

  for (const w of wantedSet) {
    if (!fingerprintSet.has(w)) console.log(`\t\t"${w}",`);
    else urls.push(w);
  }
}*/
