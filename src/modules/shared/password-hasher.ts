import { hash, verify } from "argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  dummyHash: string;
}

const argon2idOptions = {
  type: 2,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

export const productionPasswordHasher: PasswordHasher = {
  hash: (password) => hash(password, argon2idOptions),
  verify: (passwordHash, password) => verify(passwordHash, password),
  dummyHash:
    "$argon2id$v=19$m=19456,t=2,p=1$cW5leHVzLWR1bW15LWhhc2g$9AOoZaKAA90eeVst5BziVZWP7KOsA6FEt9HKV8ws/1g",
};
