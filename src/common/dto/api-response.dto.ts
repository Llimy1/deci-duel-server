export class ApiResponse<T> {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly data: T,
  ) {}
}
