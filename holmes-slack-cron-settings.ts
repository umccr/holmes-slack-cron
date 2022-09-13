/**
 * The value of the Stack tag that we try to set throughout the entire deployment (for accurate costing)
 */
export const TAG_STACK_VALUE = "HolmesSlackCron";

/**
 * The value of the CloudFormation description set throughout all stacks
 */
export const STACK_DESCRIPTION =
  "Holmes Slack Cron is a Cron schedule driven tool for sending regular reports to Slack about new fingerprints";

export type HolmesSlackCronSettings = {
  /**
   * The fingerprint bucket
   */
  readonly bucket: string;
};
