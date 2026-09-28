import { Injectable } from '@nestjs/common';

// Comfortably longer than any access token lifetime (JWT_ACCESS_TTL).
const REMEMBER_MS = 24 * 60 * 60 * 1000;

/**
 * Deleted accounts whose access tokens may still be unexpired. In-process is
 * enough for a single instance; several instances would need a shared store.
 */
@Injectable()
export class RevokedUsers {
  private readonly revokedAt = new Map<string, number>();

  add(userId: string): void {
    this.revokedAt.set(userId, Date.now());
  }

  has(userId: string): boolean {
    const now = Date.now();
    for (const [id, at] of this.revokedAt) {
      if (now - at > REMEMBER_MS) this.revokedAt.delete(id);
    }
    return this.revokedAt.has(userId);
  }
}
