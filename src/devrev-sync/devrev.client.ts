import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { DevRevSyncConfig } from "./devrev-sync.config";

const IN_CLIENT_RETRIES = 2;
const MAX_IN_CLIENT_WAIT_MS = 10000;

/**
 * A failed DevRev call, classified so the caller knows what to do next.
 * The message never contains the request body or the token.
 */
export class DevRevApiError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number | null,
    /** Worth retrying later: network error, timeout, 429 or 5xx. */
    readonly retryable: boolean,
    /** From Retry-After on a 429, if DevRev sent one. */
    readonly retryAfterMs: number | null,
    readonly requestId: string | null,
    readonly body: any
  ) {
    super(message);
    this.name = "DevRevApiError";
  }

  /** create hit an existing unique_key. */
  get isConflict(): boolean {
    const text = `${JSON.stringify(this.body ?? {})} ${this.message}`;
    return (
      this.status === 409 ||
      /unique|already exist|duplicate|conflict/i.test(text)
    );
  }

  /**
   * The DevRev schema doesn't match what we sent: unknown field, bad enum
   * value, or the type's schema was never created. Retrying can't fix it.
   */
  get isSchemaError(): boolean {
    const text = `${JSON.stringify(this.body ?? {})} ${this.message}`;
    return /field_not_in_schema|not in referenced custom schema|no tenant fragment|invalid enum|not a valid value/i.test(
      text
    );
  }
}

/** Pulls the record ID out of any DevRev response shape. */
export function idOf(response: any): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  if (typeof response.id === "string") return response.id;
  const wrapped = Object.values(response).find(
    (v: any) => v && typeof v === "object" && !Array.isArray(v) && v.id
  ) as any;
  return wrapped?.id;
}

/** The first array in a DevRev list response, whatever its key. */
export function firstArray(response: any): any[] {
  if (!response || typeof response !== "object") return [];
  return (Object.values(response).find(Array.isArray) as any[]) ?? [];
}

/** Request fields safe to log: keys and IDs only, never personal data. */
const LOGGED_REQUEST_FIELDS = [
  "leaf_type",
  "unique_key",
  "id",
  "external_ref",
  "custom_link_type",
  "source",
  "target",
];

/** Short `key=value` summary of a request body for the logs. */
export function describeRequest(body: Record<string, any>): string {
  if (!body || typeof body !== "object") return "";
  const parts = LOGGED_REQUEST_FIELDS.filter(
    (key) => typeof body[key] === "string" && body[key]
  ).map((key) => `${key}=${body[key]}`);
  if (Array.isArray(body.external_ref)) {
    parts.push(`external_ref=${body.external_ref.join(",")}`);
  }
  if (body.filter) parts.push(`filter=${JSON.stringify(body.filter)}`);
  return parts.join(" ");
}

@Injectable()
export class DevRevClient {
  private readonly logger = new Logger("DevRevSync");
  private dryRunCounter = 0;

  constructor(private readonly config: DevRevSyncConfig) {}

  /**
   * POST one DevRev endpoint. Retries 429, 5xx and network errors a couple of
   * times in place; anything still failing is thrown as a DevRevApiError for
   * the queue's own backoff to handle.
   */
  async post<T = any>(endpoint: string, body: Record<string, any>): Promise<T> {
    if (this.config.dryRun) {
      this.logger.log(`[dry-run] POST /${endpoint} ${JSON.stringify(body)}`);
      return this.dryRunResponse(endpoint) as T;
    }

    const summary = describeRequest(body);
    let lastError: DevRevApiError | null = null;
    for (let attempt = 1; attempt <= IN_CLIENT_RETRIES + 1; attempt++) {
      const started = Date.now();
      this.logger.log(
        `POST /${endpoint} calling${summary ? ` ${summary}` : ""}` +
          (attempt > 1 ? ` (attempt ${attempt})` : "")
      );
      try {
        const response = await axios.post(
          `${this.config.baseUrl}/${endpoint}`,
          body,
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${this.config.token}`,
            },
            timeout: this.config.requestTimeoutMs,
          }
        );
        const outcome = endpoint.endsWith(".list")
          ? ` found=${firstArray(response.data).length}`
          : idOf(response.data)
          ? ` id=${idOf(response.data)}`
          : "";
        this.logger.log(
          `POST /${endpoint} -> ${response.status} in ${
            Date.now() - started
          }ms${outcome}` +
            this.requestIdSuffix(response.headers)
        );
        return response.data as T;
      } catch (error) {
        lastError = this.classify(endpoint, error as AxiosError);
        if (!lastError.retryable || attempt > IN_CLIENT_RETRIES) {
          this.logger.error(
            `POST /${endpoint} failed in ${Date.now() - started}ms: ${
              lastError.message
            }` +
              (summary ? ` ${summary}` : "") +
              (lastError.requestId ? ` (request ${lastError.requestId})` : "")
          );
          break;
        }
        const wait = Math.min(
          lastError.retryAfterMs ?? 1000 * 2 ** attempt,
          MAX_IN_CLIENT_WAIT_MS
        );
        this.logger.warn(
          `POST /${endpoint} -> ${
            lastError.status ?? "network error"
          }, retry ${attempt}/${IN_CLIENT_RETRIES} in ${wait}ms` +
            (lastError.requestId ? ` (request ${lastError.requestId})` : "")
        );
        await this.sleep(wait);
      }
    }
    throw lastError;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private classify(endpoint: string, error: AxiosError): DevRevApiError {
    const response = error.response;
    const status = response?.status ?? null;
    const body: any = response?.data ?? null;
    const requestId = this.requestId(response?.headers);
    const retryAfterSeconds = Number(response?.headers?.["retry-after"]);
    const retryAfterMs =
      status === 429 &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : null;
    const retryable = status === null || status === 429 || status >= 500;
    const detail =
      [body?.type, body?.message, body?.detail]
        .filter((v) => typeof v === "string" && v)
        .join(" | ") ||
      error.code ||
      error.message;
    return new DevRevApiError(
      `${endpoint} ${status ?? "network error"}: ${detail}`,
      endpoint,
      status,
      retryable,
      retryAfterMs,
      requestId,
      body
    );
  }

  private requestId(headers: any): string | null {
    return (
      headers?.["x-request-id"] ?? headers?.["x-devrev-request-id"] ?? null
    );
  }

  private requestIdSuffix(headers: any): string {
    const id = this.requestId(headers);
    return id ? ` (request ${id})` : "";
  }

  /** Fake but well-shaped responses so the whole flow runs in dry-run mode. */
  private dryRunResponse(endpoint: string): any {
    if (endpoint.endsWith(".list")) return { items: [] };
    return { id: `don:dry-run:${endpoint}:${++this.dryRunCounter}` };
  }
}
