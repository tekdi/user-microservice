import { PipeTransform, Injectable } from '@nestjs/common';

/**
 * Coerces multipart/form-data body so string "true"/"false" and numeric strings
 * become real boolean and number before ValidationPipe runs.
 */
@Injectable()
export class CoerceFormDataPipe implements PipeTransform {
  transform(body: Record<string, unknown>): Record<string, unknown> {
    if (!body || typeof body !== 'object') return body;

    const result = { ...body };

    if ('is_active' in result && result.is_active !== undefined && result.is_active !== null) {
      const v = result.is_active;
      if (v === true || v === 'true') result.is_active = true;
      else if (v === false || v === 'false') result.is_active = false;
    }

    if ('display_order' in result && result.display_order !== undefined && result.display_order !== null) {
      const v = result.display_order;
      const n = Number(v);
      if (!Number.isNaN(n)) result.display_order = n;
    }

    if ('tags' in result && result.tags !== undefined && result.tags !== null) {
      const v = result.tags;
      if (typeof v === 'string') {
        try {
          const parsed = JSON.parse(v);
          result.tags = Array.isArray(parsed) ? parsed : [v];
        } catch {
          result.tags = v.trim() ? [v] : [];
        }
      }
    }

    return result;
  }
}
