export interface NetworkRequestRecord {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  failed?: boolean;
  failureText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  postData?: string | null;
  frameUrl?: string | null;
}

export interface ListNetworkRequestsOptions {
  limit?: number;
  urlPattern?: string;
  method?: string;
  resourceType?: string;
}
