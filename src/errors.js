export class ShiverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ShiverError';
    this.code = code;
  }
}

export class UserError extends Error {
  constructor(message) {
    super(typeof message === 'string' ? message : 'UserError');
    this.name = 'UserError';
    this.payload = message;
  }
}
