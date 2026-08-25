export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Error inesperado.";
  if (status === 500) console.error(error);
  return Response.json({ error: message }, { status });
}
