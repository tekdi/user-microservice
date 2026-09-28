import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import {
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { PasswordEncryptionService } from "./password-encryption.service";

// Throwaway RSA test key pair generated solely for this spec file — never used
// outside tests, never sourced from real configuration/.env.
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmQssuirXJG9W+E89t9eq
P+kH1OuzVk+36FHFRksoMdBn1bE2fsuQTP+pO2h4bPKQZYkH9FWhFXMlqPs5kBFd
uN8MsI3N51gQxfJ4IFSpa59a9/mbrZ6js7cdxWZWonMUFfnLDJTtXI67ixyESIN0
HI9l3TDw7ORE/w2o9praOO6xMlAIir/up+DH2fop4UE+TNAWYpytnC7LaVgTigig
y7m5wcUjxERLOYQI5V/LhV/i9SDBG5G7oEwqeoXk6gOH2Qh+h7v1075J8WmsHskl
wk5yTaayVIROlX2JdTbn1X6BtV+dROQ5ZPg645VLA9PWIPSp7nbMdQ9s7B4YuHUS
XwIDAQAB
-----END PUBLIC KEY-----`;

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCZCyy6Ktckb1b4
Tz2316o/6QfU67NWT7foUcVGSygx0GfVsTZ+y5BM/6k7aHhs8pBliQf0VaEVcyWo
+zmQEV243wywjc3nWBDF8nggVKlrn1r3+ZutnqOztx3FZlaicxQV+csMlO1cjruL
HIRIg3Qcj2XdMPDs5ET/Daj2mto47rEyUAiKv+6n4MfZ+inhQT5M0BZinK2cLstp
WBOKCKDLubnBxSPEREs5hAjlX8uFX+L1IMEbkbugTCp6heTqA4fZCH6Hu/XTvknx
aaweySXCTnJNprJUhE6VfYl1NufVfoG1X51E5Dlk+DrjlUsD09Yg9Knudsx1D2zs
Hhi4dRJfAgMBAAECggEAGBl6YZZ9am9d8pwHy/taA9ZeNVkoVF8ZRqwZtIgBPFbl
AvF082J6xqU7sO8yh3Vq55I8fm09gHMxavqkhds2NvZouSSbV+K2QXV9FRo/04K0
gHf928kvXg1n0r3axpn4f71mDAUnm3uebLmA2ypYDmdGUx5x0dvgQYmVIcAgvPYa
+ettOMnPLQ3W39VZ1crMPXtIUCEryiKYnCskmiAqqq2tMpbU1mAnLQcjrKO4nFcF
s5RDwpY+rp0CUYTYUqFQoT2sBhdOMj+z9ZgQWa3dlw44iJ6Yw9cR17HjvxYrTXdA
FonCwMtmaZ/mjZEANIgaeWYK9YLDZy6J3cOIDWIQAQKBgQDHiNoIope8LeGTxjNS
ZnFOEo35LjIo7w7ajK+Gx9Fkuxwop90y9oCkeRAXR/uPP3Q2eI0oniMp4Zc637u6
cx416EEKUpBLSfcCZkV7bi/EwThX8HqTpvr4I50um31b+Tb2bQwY5FlKJs9vxOv4
c1je/VnIjxlplMlmVKHrmp8JgQKBgQDEWlG0ZDZJuS2LDlBTbspU1af5M2MUEsVh
Nw7uQ+It54clI1TnWPO8prI9VC264ek94rq05ZF3CD1yOJPxhb0nAxQfkycxpNHX
fI4DzAeJXarzTFNg5kwTAKri9nPUzLywpVpuSSvll7O0KZZTniprZK8DnbwGJt+Z
iULg46NL3wKBgQCNyl794eSncYcqBp8zv95mV2MSHlTAp9hLT8vvoBDZXulMrrTO
YULbHbhkgt9tVO8VQic1JOLiARABYzm47dMbBZcqaa9mAQKJbvmTE6LYU2Hhg97n
C7KuIEiy9QVpFTiMdsMw8RvOSLQBvdLdc8JEe46QqbeqQnO3xw5lKTQ4gQKBgAH9
SEajnUkx7xwxkO7HeJVTdNg5hQ93ATjy7dvMJEaCygO+T+XoKNAIgFXOvIfgMhTG
b03V5ZtnIfg+SoFv8XKrvVB0lTkTimy8flPbhVgG8ux0IYQh0TOAFjsmdBX73Q2N
H1VuuFsjJlb09Ojz+UoNQxiuSHFng2xyz5Knu8fRAoGAauooMXDQeJERlQLaZT8D
+NuMRd3xgs2TaEdl1pFPmObs+sAGXYuQbcuJdgeeq/lVic4AoYRAsi4UykKyeOaP
C2m+Iv5eLn9xeAo75+i2uwbZW7JN/toJNx+UQoqDeSsGwKstSWtNZsQ7imyXwyKa
AUuoIYVDSgptWUA4eYZVTEo=
-----END PRIVATE KEY-----`;

describe("PasswordEncryptionService", () => {
  let service: PasswordEncryptionService;
  let configStore: Record<string, string>;

  const buildModule = async (
    overrides: Record<string, string> = {}
  ): Promise<PasswordEncryptionService> => {
    configStore = {
      PASSWORD_ENCRYPTION_PUBLIC_KEY: TEST_PUBLIC_KEY,
      PASSWORD_ENCRYPTION_PRIVATE_KEY: TEST_PRIVATE_KEY,
      PASSWORD_ENCRYPTION_KEY_ID: "v1",
      ...overrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordEncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configStore[key]),
          },
        },
      ],
    }).compile();

    return module.get<PasswordEncryptionService>(PasswordEncryptionService);
  };

  beforeEach(async () => {
    service = await buildModule();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("encrypt/decrypt round trip", () => {
    it("decrypts back to the original plain text", () => {
      const encrypted = service.encrypt("Test@123");
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe("Test@123");
    });

    it("produces different ciphertexts for the same value (OAEP randomness)", () => {
      const first = service.encrypt("Test@123");
      const second = service.encrypt("Test@123");
      expect(first).not.toBe(second);
      expect(service.decrypt(first)).toBe("Test@123");
      expect(service.decrypt(second)).toBe("Test@123");
    });
  });

  describe("invalid ciphertext", () => {
    it("throws a controlled error for a tampered/invalid ciphertext", () => {
      const encrypted = service.encrypt("Test@123");
      const tampered =
        encrypted.slice(0, -4) + (encrypted.slice(-4) === "AAAA" ? "BBBB" : "AAAA");

      expect(() => service.decrypt(tampered)).toThrow(BadRequestException);
    });

    it("throws a controlled error for a non-base64 payload", () => {
      expect(() => service.decrypt("not-a-valid-payload-!!")).toThrow(
        BadRequestException
      );
    });
  });

  describe("empty input", () => {
    it("throws for empty encrypt input", () => {
      expect(() => service.encrypt("")).toThrow(BadRequestException);
    });

    it("throws for empty decrypt input", () => {
      expect(() => service.decrypt("")).toThrow(BadRequestException);
    });
  });

  describe("public key", () => {
    it("returns the configured public key", () => {
      expect(service.getPublicKey()).toBe(TEST_PUBLIC_KEY);
    });

    it("returns the configured key id", () => {
      expect(service.getKeyId()).toBe("v1");
    });

    it("defaults the key id to v1 when not configured", async () => {
      const svc = await buildModule({ PASSWORD_ENCRYPTION_KEY_ID: undefined });
      expect(svc.getKeyId()).toBe("v1");
    });
  });

  describe("private key protection", () => {
    it("never returns the private key from getPublicKey()", () => {
      const publicKey = service.getPublicKey();
      expect(publicKey).not.toContain("PRIVATE KEY");
      expect(publicKey).toBe(TEST_PUBLIC_KEY);
    });

    it("does not expose the private key in thrown errors", () => {
      let caught: Error | undefined;
      try {
        service.decrypt("invalid-payload");
      } catch (error) {
        caught = error as Error;
      }
      expect(caught).toBeDefined();
      expect(caught.message).not.toContain("PRIVATE KEY");
      expect(caught.message).not.toContain(TEST_PRIVATE_KEY);
    });

    it("does not log the private key when encrypting/decrypting", () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation();
      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      const encrypted = service.encrypt("Test@123");
      service.decrypt(encrypted);

      const allLoggedOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .join(" ");
      expect(allLoggedOutput).not.toContain(TEST_PRIVATE_KEY);
      expect(allLoggedOutput).not.toContain("Test@123");
      expect(allLoggedOutput).not.toContain(encrypted);

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("configuration errors", () => {
    it("throws when the public key is missing", async () => {
      const svc = await buildModule({ PASSWORD_ENCRYPTION_PUBLIC_KEY: undefined });
      expect(() => svc.encrypt("Test@123")).toThrow(InternalServerErrorException);
      expect(() => svc.getPublicKey()).toThrow(InternalServerErrorException);
    });

    it("throws when the private key is missing", async () => {
      const svc = await buildModule({ PASSWORD_ENCRYPTION_PRIVATE_KEY: undefined });
      const encrypted = svc.encrypt("Test@123");
      expect(() => svc.decrypt(encrypted)).toThrow(InternalServerErrorException);
    });

    it("throws a controlled error for an invalid public key", async () => {
      const svc = await buildModule({
        PASSWORD_ENCRYPTION_PUBLIC_KEY: "not-a-real-key",
      });
      expect(() => svc.encrypt("Test@123")).toThrow(InternalServerErrorException);
    });

    it("throws a controlled error for an invalid private key", async () => {
      const svc = await buildModule({
        PASSWORD_ENCRYPTION_PRIVATE_KEY: "not-a-real-key",
      });
      const encrypted = service.encrypt("Test@123");
      expect(() => svc.decrypt(encrypted)).toThrow(InternalServerErrorException);
    });

    it("does not leak configuration details in the error message", async () => {
      const svc = await buildModule({ PASSWORD_ENCRYPTION_PUBLIC_KEY: undefined });
      try {
        svc.getPublicKey();
        fail("expected getPublicKey to throw");
      } catch (error) {
        expect((error as Error).message).not.toMatch(/PASSWORD_ENCRYPTION/);
      }
    });
  });
});
