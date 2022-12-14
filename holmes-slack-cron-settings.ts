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

  /**
   * The cron expression
   */
  readonly cron: string;

  /**
   * Days or undefined to mean last
   */
  readonly days?: number;

  /**
   * The slack channel to report to
   */
  readonly channel: string;

  /**
   * The sites checksum to be looking at
   */
  readonly sitesChecksum: string;
};
