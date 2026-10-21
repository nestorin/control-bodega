import { describe, expect, it, vi } from "vitest"
import { ReceptionSubmission } from "./receptionSubmission"

describe("ReceptionSubmission", () => {
  it("retains the created reception after evidence fails and retries only evidence", async () => {
    const onStatusChange = vi.fn()
    const submission = new ReceptionSubmission("REC-stable-1", onStatusChange)
    const reception = { id: "reception-1" }
    const createReception = vi.fn(async () => reception)
    const uploadEvidence = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValueOnce(undefined)

    await expect(
      submission.submit(createReception, uploadEvidence),
    ).rejects.toThrow("Storage unavailable")
    expect(submission.receptionId).toBe(reception.id)
    expect(createReception).toHaveBeenCalledOnce()
    expect(uploadEvidence).toHaveBeenCalledWith(
      reception,
      "REC-stable-1:evidence",
    )

    await expect(
      submission.submit(createReception, uploadEvidence),
    ).resolves.toEqual({ reception, status: "evidence_uploaded" })
    expect(createReception).toHaveBeenCalledOnce()
    expect(uploadEvidence).toHaveBeenCalledTimes(2)
    expect(onStatusChange).toHaveBeenLastCalledWith("evidence_uploaded")
  })

  it("shares an in-flight create for double submission", async () => {
    const submission = new ReceptionSubmission("REC-stable-2", vi.fn())
    let resolveCreate!: (value: { id: string }) => void
    const createReception = vi.fn(
      () => new Promise<{ id: string }>((resolve) => (resolveCreate = resolve)),
    )

    const first = submission.submit(createReception)
    const second = submission.submit(createReception)
    resolveCreate({ id: "reception-2" })

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        reception: { id: "reception-2" },
        status: "evidence_not_selected",
      },
      {
        reception: { id: "reception-2" },
        status: "evidence_not_selected",
      },
    ])
    expect(createReception).toHaveBeenCalledOnce()
  })
})
