// Erro único que as telas recebem, venha da API, da rede ou do mock.
export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export function isApiDown(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === "api_fora_do_ar";
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Algo deu errado.";
}
