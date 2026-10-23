export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, "not_found");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, "forbidden");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "conflict");
  }
}

export class BadRequestError extends DomainError {
  constructor(message: string) {
    super(message, "bad_request");
  }
}

export class InsufficientCreditsError extends DomainError {
  constructor(message: string) {
    super(message, "insufficient_credits");
  }
}
