import { groupingCommand } from "./grouping-command";

exports.handler = async function (event: any) {
  const bucket = process.env["BUCKET"];
  const sc = process.env["SITES_CHECKSUM"];
  const channel = process.env["CHANNEL"];

  if (!bucket || !sc || !channel)
    return {
      status:
        "not executed due to missing env variables BUCKET, SITES_CHECKSUM or CHANNEL",
    };

  const days = process.env["DAYS"];

  await groupingCommand(
    {
      sc: sc,
      channel: channel,
      bucket: bucket,
    },
    {
      relatedness: 0.75,
      days: days ? parseInt(days) : undefined,
      concurrency: 5,
    }
  );

  return {
    status: "done",
  };
};
