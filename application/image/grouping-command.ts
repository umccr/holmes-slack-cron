import { _Object } from "@aws-sdk/client-s3";
import { format, isSameDay, max, subDays } from "date-fns";
import { LastBatchOpts, MainOpts } from "./opts.js";
import {
  bucketKeyToUrl,
  findCheck,
  getSlackWebClient,
  groupUrls,
  s3ListAllFingerprintFiles,
} from "./common.js";

/**
 * A command to print to slack information about the grouping of a batch of sequencing.
 *
 * @param mainOpts
 * @param lastBatchOpts
 */
export async function groupingCommand(
  mainOpts: MainOpts,
  lastBatchOpts: LastBatchOpts
) {
  // get the Slack client immediately so that we don't do any work if it is not configured!
  // if this fails we have no way to communicate that other than the absence of a message
  const web = await getSlackWebClient();

  // any error that we experience from here will be logged to Slack
  try {
    // service discover the steps bits of holmes
    const checkStepsArn = await findCheck();

    // find all the fingerprints present
    const allFingerprints: _Object[] = [];
    for await (const i of s3ListAllFingerprintFiles(
      mainOpts.bucket,
      mainOpts.sc
    ))
      allFingerprints.push(i);

    // from all the fingerprints we are going to identify a set from a single day
    const urls: string[] = [];
    let batchDate;

    if (lastBatchOpts.days) {
      batchDate = subDays(new Date(), lastBatchOpts.days);
      console.log(
        `We were instructed to go back ${lastBatchOpts.days} days which is ${batchDate}, so we are processing that day as a batch`
      );
    } else {
      batchDate = max(allFingerprints.map((c) => c.LastModified!));
      console.log(
        `The latest date of any fingerprint is ${batchDate}, so we are processing that day as a batch`
      );
    }

    for (const c of allFingerprints) {
      if (isSameDay(c.LastModified!, batchDate)) {
        const url = bucketKeyToUrl(mainOpts, c.Key!);

        // skip folder entries
        if (url.trim().length == 0) continue;

        // skip PTC and NTC for the moment
        if (url.includes("PTC_") || url.includes("NTC_")) {
          console.log(`Skipping sample ${url}`);
        } else {
          console.log(`${url}`);
          urls.push(url);
        }
      }
    }

    const slackRunWeLookedFor = `For sequencing runs that finished fingerprinting in \`${
      mainOpts.bucket
    }\` on ${format(batchDate, "PPPP")}`;
    const slackSettingsWeUsed = `We looked for samples with relatedness threshold > ${lastBatchOpts.relatedness}`;

    // if there is nothing to even look at - we message in the simplest way
    if (urls.length === 0) {
      await web.chat.postMessage({
        channel: mainOpts.channel,
        text: `${slackRunWeLookedFor}\nWe found no new fingerprints and so no checks were run`,
      });

      return;
    }

    // do the fingerprinting and establish any groups
    const groups = await groupUrls(lastBatchOpts, checkStepsArn, urls);

    // we have run the fingerprinting - now report back via slack
    let gCount = 1;

    await web.chat.postMessage({
      channel: mainOpts.channel,
      text: `${slackRunWeLookedFor} we found ${urls.length} new fingerprints\n${slackSettingsWeUsed}`,
    });

    // unmatched individuals
    {
      const listOfSubjectsTxt = groups.unmatchedIndividualSubjectIds
        .map((s) => `\`${s}\``)
        .sort()
        .join(", ");

      let newTxt = `*New Unrelated Samples (by Subject Id)*\n${listOfSubjectsTxt}\n`;

      await web.chat.postMessage({
        channel: mainOpts.channel,
        text: newTxt,
      });
    }

    // samples that were grouped but where that was expected
    {
      const listOfSubjectsTxt = groups.matchedGroupSubjectIds
        .map((okg) => `\`${okg.subjectId}\` x${okg.count}`)
        .sort()
        .join(", ");

      let newTxt = `*New Related Samples with Grouping as Expected (by Subject Id and Match Count)*\n${listOfSubjectsTxt}\n`;

      await web.chat.postMessage({
        channel: mainOpts.channel,
        text: newTxt,
      });
    }

    for (const g of groups.matchGroups) {
      let newTxt = `*Match Group ${gCount++}*\n`;
      for (const [k, v] of g.entries()) {
        newTxt =
          newTxt +
          `\`${k}\` subj=${v.subject} lib=${v.library} r=${v.relatedness} n=${v.n} shared hets=${v.shared_hets} shared hom alts=${v.shared_hom_alts} base=${v.base}\n`;
      }

      await web.chat.postMessage({
        channel: mainOpts.channel,
        text: newTxt,
      });
    }
  } catch (error: any) {
    console.log(error);

    await web.chat.postMessage({
      channel: mainOpts.channel,
      text: error.toString(),
    });
  }
}
