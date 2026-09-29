import * as crypto from "crypto";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const RSA_OAEP_OPTIONS = {
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
};

/**
 * Reusable RSA-OAEP (SHA-256) encrypt/decrypt utility built on a manually
 * generated, externally supplied key pair. Never logs plain text, cipher
 * text, or the private key, and never returns the private key to a caller.
 */
@Injectable()
export class PasswordEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new BadRequestException("Value to encrypt must not be empty");
    }

    const publicKey = this.loadPublicKey();

    try {
      const encrypted = crypto.publicEncrypt(
        { key: publicKey, ...RSA_OAEP_OPTIONS },
        Buffer.from(value, "utf8")
      );
      return encrypted.toString("base64");
    } catch {
      throw new InternalServerErrorException("Failed to encrypt value");
    }
  }

  decrypt(encryptedValue: string): string {
    if (typeof encryptedValue !== "string" || encryptedValue.length === 0) {
      throw new BadRequestException("Encrypted value must not be empty");
    }

    const privateKey = this.loadPrivateKey();

    let payload: Buffer;
    try {
      payload = Buffer.from(encryptedValue, "base64");
      if (payload.length === 0) {
        throw new Error("empty payload");
      }
    } catch {
      throw new BadRequestException("Invalid encrypted payload");
    }

    try {
      const decrypted = crypto.privateDecrypt(
        { key: privateKey, ...RSA_OAEP_OPTIONS },
        payload
      );
      return decrypted.toString("utf8");
    } catch {
      throw new BadRequestException("Failed to decrypt value");
    }
  }

  getPublicKey(): string {
    return this.loadPublicKey();
  }

  /**
   * Transition helper: decrypts RSA-OAEP ciphertext when present, otherwise
   * returns the value untouched so callers keep working with clients that
   * have not yet switched to encrypting the field client-side.
   *
   * A misconfigured/invalid key pair still throws (loadPrivateKey rejects
   * before any decrypt attempt) — only a decrypt/format failure on the
   * payload itself is treated as "this wasn't encrypted".
   */
  decryptIfEncrypted(value: string): string {
    if (typeof value !== "string" || value.length === 0) {
      return value;
    }

    try {
      return this.decrypt(value);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return value;
      }
      throw error;
    }
  }

  getKeyId(): string {
    return this.configService.get<string>("PASSWORD_ENCRYPTION_KEY_ID") || "v1";
  }

  private normalizeKey(rawKey: string): string {
    // Env vars commonly store PEM keys with literal "\n" sequences instead of real newlines.
    return rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  }

  private loadPublicKey(): string {
    const rawKey = this.configService.get<string>(
      "PASSWORD_ENCRYPTION_PUBLIC_KEY"
    );
    if (!rawKey) {
      throw new InternalServerErrorException(
        "Encryption service is not configured properly"
      );
    }

    const publicKey = this.normalizeKey(rawKey);
    try {
      crypto.createPublicKey(publicKey);
    } catch {
      throw new InternalServerErrorException(
        "Encryption service is not configured properly"
      );
    }
    return publicKey;
  }

  private loadPrivateKey(): string {
    const rawKey = this.configService.get<string>(
      "PASSWORD_ENCRYPTION_PRIVATE_KEY"
    );
    if (!rawKey) {
      throw new InternalServerErrorException(
        "Encryption service is not configured properly"
      );
    }

    const privateKey = this.normalizeKey(rawKey);
    try {
      crypto.createPrivateKey(privateKey);
    } catch {
      throw new InternalServerErrorException(
        "Encryption service is not configured properly"
      );
    }
    return privateKey;
  }
}
