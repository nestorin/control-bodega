export type ReceptionSubmissionStatus =
  | "idle"
  | "creating"
  | "create_failed"
  | "reception_created"
  | "uploading_evidence"
  | "evidence_failed"
  | "evidence_uploaded"
  | "evidence_not_selected";

export class ReceptionSubmission<TReception extends { id: string }> {
  private reception: TReception | null = null;
  private createAttempt: ((operationId: string) => Promise<TReception>) | null = null;
  private evidenceAttempt: ((reception: TReception, operationId: string) => Promise<void>) | null =
    null;
  private inFlight: Promise<{
    reception: TReception;
    status: ReceptionSubmissionStatus;
  }> | null = null;

  constructor(
    readonly operationId: string,
    private readonly onStatusChange: (status: ReceptionSubmissionStatus) => void,
  ) {}

  get receptionId(): string | null {
    return this.reception?.id ?? null;
  }

  submit(
    createReception: (operationId: string) => Promise<TReception>,
    uploadEvidence?: (reception: TReception, operationId: string) => Promise<void>,
  ): Promise<{
    reception: TReception;
    status: ReceptionSubmissionStatus;
  }> {
    if (this.inFlight) return this.inFlight;
    this.createAttempt ??= createReception;
    if (uploadEvidence) this.evidenceAttempt ??= uploadEvidence;

    const attempt = this.run();
    this.inFlight = attempt;
    return attempt.finally(() => {
      if (this.inFlight === attempt) this.inFlight = null;
    });
  }

  private async run(): Promise<{
    reception: TReception;
    status: ReceptionSubmissionStatus;
  }> {
    if (!this.reception) {
      this.onStatusChange("creating");
      try {
        this.reception = await this.createAttempt!(this.operationId);
      } catch (error) {
        this.onStatusChange("create_failed");
        throw error;
      }
      this.onStatusChange("reception_created");
    }

    if (!this.evidenceAttempt) {
      this.onStatusChange("evidence_not_selected");
      return { reception: this.reception, status: "evidence_not_selected" };
    }

    this.onStatusChange("uploading_evidence");
    try {
      await this.evidenceAttempt(this.reception, `${this.operationId}:evidence`);
    } catch (error) {
      this.onStatusChange("evidence_failed");
      throw error;
    }
    this.onStatusChange("evidence_uploaded");
    return { reception: this.reception, status: "evidence_uploaded" };
  }
}
