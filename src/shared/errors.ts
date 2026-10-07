/** Error con mensaje apto para mostrar al usuario. */
export class UserError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
  }
}
