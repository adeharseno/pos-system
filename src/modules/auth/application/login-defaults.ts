import "server-only";

import { resolveEmailByUsername, signInWithEmailPassword, loadLoginAttempt, saveLoginAttempt } from "../data/login-repository";
import { authenticateWith, type LoginInput } from "./login-service";

export async function authenticate(input: LoginInput): Promise<void> {
  await authenticateWith(input, {
    resolveEmail: resolveEmailByUsername,
    signIn: signInWithEmailPassword,
    loadAttempt: loadLoginAttempt,
    saveAttempt: saveLoginAttempt,
  });
}
