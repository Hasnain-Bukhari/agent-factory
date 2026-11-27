export class FinanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FinanceError';
    this.code = code;
  }
}

export const fail = (code, message) => { throw new FinanceError(code, message); };
