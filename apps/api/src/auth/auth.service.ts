import { Inject, Injectable } from '@nestjs/common';
import { AUTH_PROVIDER, type AuthProvider, type AuthRequest, type AuthResult } from './auth.types.js';

/** The only entry point other code uses for authentication. Provider-agnostic. */
@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_PROVIDER) private readonly provider: AuthProvider) {}

  get providerId() {
    return this.provider.id;
  }

  authenticate(request: AuthRequest): Promise<AuthResult> {
    return this.provider.authenticate(request);
  }
}
