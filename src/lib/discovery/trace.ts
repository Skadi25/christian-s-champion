/**
 * RunTrace — collects per-stage instrumentation for one discovery run.
 * Each stage records how many candidates went in and out plus optional
 * metadata (queries used, rejection reasons, ...). Persisted after the
 * run so the UI can render a full pipeline view.
 */

export type StageEntry = {
  stage: string;
  input: number;
  output: number;
  meta?: Record<string, unknown>;
};

export class RunTrace {
  readonly stages: StageEntry[] = [];

  record(stage: string, input: number, output: number, meta?: Record<string, unknown>): void {
    this.stages.push({ stage, input, output, meta });
  }
}
