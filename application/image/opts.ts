export interface MainOpts {
  channel: string;
  bucket: string;
  sc: string;
}

export interface LastBatchOpts {
  concurrency: number;
  relatedness: number;
  days?: number;
}
