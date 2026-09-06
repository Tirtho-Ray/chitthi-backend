export interface Tokens {
  accessToken: string;
  refreshToken: string;
  jti: string;
  family: string
}

export interface JwtPayload {
  sub: string;
  version: number;
  deviceId: string;
  jti: string;
  family: string
}
