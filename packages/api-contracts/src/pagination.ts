export interface PaginationRequest {
  cursor?: string;
  limit?: number;
}

export interface PaginationResponse {
  nextCursor?: string;
}
