type AsyncTask = () => Promise<unknown>;

/** Uploads a pair together and removes successful objects if either upload fails. */
export async function uploadEvidencePair(
  uploads: readonly [AsyncTask, AsyncTask],
  cleanup: readonly [AsyncTask, AsyncTask],
): Promise<void> {
  const results = await Promise.allSettled(uploads.map((upload) => upload()));
  const failure = results.find((result) => result.status === "rejected");
  if (!failure || failure.status !== "rejected") return;

  await Promise.allSettled(
    results.map((result, index) =>
      result.status === "fulfilled" ? cleanup[index]() : Promise.resolve(),
    ),
  );
  throw failure.reason;
}
